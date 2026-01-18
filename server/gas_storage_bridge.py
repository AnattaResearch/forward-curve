#!/usr/bin/env python3
"""Bridge script to call gas_storage package and output JSON results.

This script is called by the Node.js backend to run gas storage optimization
and return results in JSON format.
"""

import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from gas_storage import (
    load_forward_curve,
    optimize_storage,
    FacilityParams,
    OptimizationParams,
)


def main():
    """Main entry point for the bridge script."""
    # Read input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    # Extract parameters
    forward_curve_path = input_data.get("forward_curve_path")
    facility_params = input_data.get("facility_params", {})
    optimization_params = input_data.get("optimization_params", {})

    if not forward_curve_path:
        print(json.dumps({"success": False, "error": "forward_curve_path is required"}))
        sys.exit(1)

    try:
        # Load forward curve
        forward = load_forward_curve(forward_curve_path)

        # Create facility parameters
        facility = FacilityParams(
            capacity=facility_params.get("capacity", 100.0),
            max_inject_rate=facility_params.get("max_inject_rate", 10.0),
            max_withdraw_rate=facility_params.get("max_withdraw_rate", 15.0),
            inject_cost=facility_params.get("inject_cost", 0.0),
            withdraw_cost=facility_params.get("withdraw_cost", 0.0),
            initial_inventory=facility_params.get("initial_inventory", 0.0),
        )

        # Create optimization parameters
        asof_date_str = optimization_params.get("asof_date")
        asof_date = None
        if asof_date_str:
            asof_date = date.fromisoformat(asof_date_str)

        params = OptimizationParams(
            risk_free_rate=optimization_params.get("risk_free_rate", 0.05),
            trading_days_per_year=optimization_params.get("trading_days_per_year", 252),
            asof_date=asof_date,
        )

        # Run optimization
        result = optimize_storage(forward, facility, params)

        # Get storage positions
        positions = result.get_storage_positions()

        # Build output
        trades = []
        if not result.trades_df.empty:
            for _, row in result.trades_df.iterrows():
                trades.append({
                    "inject_period": int(row["Inject_Period"]),
                    "withdraw_period": int(row["Withdraw_Period"]),
                    "inject_date": row["Inject_Date"].strftime("%Y-%m-%d"),
                    "withdraw_date": row["Withdraw_Date"].strftime("%Y-%m-%d"),
                    "volume": float(row["Volume"]),
                    "spread": float(row["Spread"]),
                    "profit": float(row["Profit"]),
                })

        # Build storage positions output
        storage_positions = []
        for expiry_date, position in positions.items():
            storage_positions.append({
                "date": expiry_date.strftime("%Y-%m-%d"),
                "position": float(position),
            })

        # Get injection and withdrawal schedules
        injections = result.get_injection_schedule()
        withdrawals = result.get_withdrawal_schedule()

        injection_schedule = []
        for expiry_date, volume in injections.items():
            if volume > 1e-6:
                injection_schedule.append({
                    "date": expiry_date.strftime("%Y-%m-%d"),
                    "volume": float(volume),
                })

        withdrawal_schedule = []
        for expiry_date, volume in withdrawals.items():
            if volume > 1e-6:
                withdrawal_schedule.append({
                    "date": expiry_date.strftime("%Y-%m-%d"),
                    "volume": float(volume),
                })

        output = {
            "success": result.success,
            "total_pnl": float(result.total_pnl),
            "num_trades": result.num_trades,
            "trades": trades,
            "storage_positions": storage_positions,
            "injection_schedule": injection_schedule,
            "withdrawal_schedule": withdrawal_schedule,
            "facility_params": {
                "capacity": facility.capacity,
                "max_inject_rate": facility.max_inject_rate,
                "max_withdraw_rate": facility.max_withdraw_rate,
                "inject_cost": facility.inject_cost,
                "withdraw_cost": facility.withdraw_cost,
                "initial_inventory": facility.initial_inventory,
            },
        }

        print(json.dumps(output))

    except FileNotFoundError as e:
        print(json.dumps({"success": False, "error": f"File not found: {e}"}))
        sys.exit(1)
    except ValueError as e:
        print(json.dumps({"success": False, "error": f"Invalid value: {e}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Optimization failed: {e}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
