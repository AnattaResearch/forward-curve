/**
 * Gas Storage Client
 * 
 * This module provides a TypeScript interface to call the gas_storage Python package
 * via a subprocess bridge script.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input types for the Python bridge
export interface GasStorageFacilityParams {
  capacity: number;           // Maximum storage capacity
  max_inject_rate: number;    // Maximum injection rate per period
  max_withdraw_rate: number;  // Maximum withdrawal rate per period
  inject_cost: number;        // Cost per unit injected
  withdraw_cost: number;      // Cost per unit withdrawn
  initial_inventory: number;  // Initial gas inventory
}

export interface GasStorageOptimizationParams {
  risk_free_rate: number;         // Annual risk-free interest rate
  trading_days_per_year: number;  // Number of trading days per year
  asof_date?: string;             // Valuation date (YYYY-MM-DD)
}

// Output types from the Python bridge
export interface GasStorageTrade {
  inject_period: number;
  withdraw_period: number;
  inject_date: string;
  withdraw_date: string;
  volume: number;
  spread: number;
  profit: number;
}

export interface GasStoragePosition {
  date: string;
  position: number;
}

export interface GasStorageScheduleEntry {
  date: string;
  volume: number;
}

export interface GasStorageResult {
  success: boolean;
  error?: string;
  total_pnl: number;
  num_trades: number;
  trades: GasStorageTrade[];
  storage_positions: GasStoragePosition[];
  injection_schedule: GasStorageScheduleEntry[];
  withdrawal_schedule: GasStorageScheduleEntry[];
  facility_params: GasStorageFacilityParams;
}

// Forward curve data format expected by gas_storage
export interface ForwardCurveEntry {
  expiry_date: string;  // YYYY-MM-DD
  price: number;
  contract?: string;
}

// Default facility parameters matching gas_storage defaults
export const DEFAULT_FACILITY_PARAMS: GasStorageFacilityParams = {
  capacity: 100.0,
  max_inject_rate: 10.0,
  max_withdraw_rate: 15.0,
  inject_cost: 0.0,
  withdraw_cost: 0.0,
  initial_inventory: 0.0,
};

// Default optimization parameters
export const DEFAULT_OPTIMIZATION_PARAMS: GasStorageOptimizationParams = {
  risk_free_rate: 0.05,
  trading_days_per_year: 252,
};

/**
 * Write forward curve data to a temporary CSV file
 */
function writeForwardCurveCSV(forwardCurve: ForwardCurveEntry[]): string {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `forward_curve_${Date.now()}.csv`);
  
  const header = 'Expiry Date,Price,Contract';
  const rows = forwardCurve.map(entry => 
    `${entry.expiry_date},${entry.price},${entry.contract || ''}`
  );
  
  const csvContent = [header, ...rows].join('\n');
  fs.writeFileSync(tmpFile, csvContent, 'utf-8');
  
  return tmpFile;
}

/**
 * Clean up temporary file
 */
function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to cleanup temp file ${filePath}:`, error);
  }
}

/**
 * Run gas storage optimization using the Python bridge
 */
export async function runGasStorageOptimization(
  forwardCurve: ForwardCurveEntry[],
  facilityParams: Partial<GasStorageFacilityParams> = {},
  optimizationParams: Partial<GasStorageOptimizationParams> = {}
): Promise<GasStorageResult> {
  // Merge with defaults
  const facility: GasStorageFacilityParams = {
    ...DEFAULT_FACILITY_PARAMS,
    ...facilityParams,
  };
  
  const optimization: GasStorageOptimizationParams = {
    ...DEFAULT_OPTIMIZATION_PARAMS,
    ...optimizationParams,
  };

  // Validate initial inventory doesn't exceed capacity
  if (facility.initial_inventory > facility.capacity) {
    return {
      success: false,
      error: `initial_inventory (${facility.initial_inventory}) cannot exceed capacity (${facility.capacity})`,
      total_pnl: 0,
      num_trades: 0,
      trades: [],
      storage_positions: [],
      injection_schedule: [],
      withdrawal_schedule: [],
      facility_params: facility,
    };
  }

  // Write forward curve to temp file
  const csvPath = writeForwardCurveCSV(forwardCurve);
  
  try {
    // Prepare input for Python bridge
    const input = {
      forward_curve_path: csvPath,
      facility_params: facility,
      optimization_params: optimization,
    };

    // Get the path to the bridge script
    const bridgeScript = path.join(__dirname, 'gas_storage_bridge.py');

    // Run Python bridge
    const result = await new Promise<GasStorageResult>((resolve, reject) => {
      const python = spawn('python3', [bridgeScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0 && !stdout) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse Python output: ${stdout}\nStderr: ${stderr}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });

      // Send input to Python
      python.stdin.write(JSON.stringify(input));
      python.stdin.end();
    });

    return result;

  } finally {
    // Clean up temp file
    cleanupTempFile(csvPath);
  }
}
