#!/usr/bin/env python3
"""
Natural Gas Futures Data Fetcher
This script fetches live forward curve and historical data for Natural Gas futures.
"""

import json
import sys
import yfinance as yf
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta

# Month codes used by CME/Yahoo Finance for futures contracts
MONTH_CODES = {
    1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M',
    7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z'
}

MONTH_NAMES = {
    1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
    7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'
}


def fetch_forward_curve(num_months=24):
    """Fetch live forward curve data for the specified number of months."""
    start_date = datetime.now()
    current_date = start_date.replace(day=1)
    
    results = []
    
    for i in range(num_months):
        future_date = current_date + relativedelta(months=i)
        month = future_date.month
        year = future_date.year
        year_short = year % 100
        
        month_code = MONTH_CODES[month]
        yahoo_symbol = f"NG{month_code}{year_short}.NYM"
        
        price = None
        volume = None
        open_price = None
        high_price = None
        low_price = None
        last_update = None
        
        try:
            ticker = yf.Ticker(yahoo_symbol)
            hist = ticker.history(period="5d")
            
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
                volume = int(hist['Volume'].iloc[-1]) if 'Volume' in hist.columns else None
                open_price = float(hist['Open'].iloc[-1]) if 'Open' in hist.columns else None
                high_price = float(hist['High'].iloc[-1]) if 'High' in hist.columns else None
                low_price = float(hist['Low'].iloc[-1]) if 'Low' in hist.columns else None
                last_update = str(hist.index[-1])
        except Exception as e:
            pass
        
        if price is not None:
            results.append({
                'contract': f"{MONTH_NAMES[month]} {year}",
                'symbol': yahoo_symbol,
                'month': month,
                'year': year,
                'cmeCode': f"NG{month_code}{year_short}",
                'price': round(price, 4),
                'open': round(open_price, 4) if open_price else None,
                'high': round(high_price, 4) if high_price else None,
                'low': round(low_price, 4) if low_price else None,
                'volume': volume,
                'lastUpdate': last_update
            })
    
    return results


def fetch_historical_prices(days=365):
    """Fetch historical price data for the continuous contract."""
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    
    ticker = yf.Ticker("NG=F")
    hist = ticker.history(start=start_date)
    
    if hist.empty:
        return []
    
    results = []
    for date, row in hist.iterrows():
        results.append({
            'date': str(date.date()),
            'open': round(float(row['Open']), 4),
            'high': round(float(row['High']), 4),
            'low': round(float(row['Low']), 4),
            'close': round(float(row['Close']), 4),
            'volume': int(row['Volume'])
        })
    
    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "forward_curve":
        num_months = int(sys.argv[2]) if len(sys.argv) > 2 else 24
        data = fetch_forward_curve(num_months)
        print(json.dumps(data))
    
    elif command == "historical":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
        data = fetch_historical_prices(days)
        print(json.dumps(data))
    
    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)
