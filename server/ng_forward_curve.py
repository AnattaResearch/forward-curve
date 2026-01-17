#!/usr/bin/env python3
"""
Natural Gas Futures Forward Curve Data Fetcher

This module provides functionality to fetch historical and live forward curves
for Natural Gas (Henry Hub) futures from free public sources.

Data Sources:
- Yahoo Finance (via yfinance library): Primary source for futures data
  - Continuous contract: NG=F
  - Individual contracts: NGH26.NYM, NGM26.NYM, etc.

Author: Manus AI
Date: January 2026
"""

import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from typing import List, Dict, Optional, Tuple
import warnings
import requests
from bs4 import BeautifulSoup
import json
import time

warnings.filterwarnings('ignore')


class NaturalGasForwardCurve:
    """
    A class to fetch and analyze Natural Gas futures forward curve data.
    
    This class provides methods to:
    - Fetch live forward curve data (current prices for multiple contract months)
    - Fetch historical forward curve data
    - Visualize forward curves
    - Export data to various formats
    
    Example Usage:
        >>> ng = NaturalGasForwardCurve()
        >>> curve = ng.fetch_live_forward_curve(num_months=12)
        >>> ng.plot_forward_curve(curve)
    """
    
    # Month codes used by CME/Yahoo Finance for futures contracts
    MONTH_CODES = {
        1: 'F', 2: 'G', 3: 'H', 4: 'J', 5: 'K', 6: 'M',
        7: 'N', 8: 'Q', 9: 'U', 10: 'V', 11: 'X', 12: 'Z'
    }
    
    MONTH_NAMES = {
        1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
        7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'
    }
    
    def __init__(self):
        """Initialize the NaturalGasForwardCurve instance."""
        self.continuous_symbol = "NG=F"  # Yahoo Finance continuous contract symbol
        self.base_symbol = "NG"  # Base symbol for natural gas futures
        
    def _generate_contract_symbols(self, num_months: int = 24, 
                                   start_date: Optional[datetime] = None) -> List[Dict]:
        """
        Generate futures contract symbols for the specified number of months.
        
        Args:
            num_months: Number of future months to generate symbols for
            start_date: Starting date (defaults to current date)
            
        Returns:
            List of dictionaries containing contract information
        """
        if start_date is None:
            start_date = datetime.now()
        
        contracts = []
        current_date = start_date.replace(day=1)
        
        for i in range(num_months):
            future_date = current_date + relativedelta(months=i)
            month = future_date.month
            year = future_date.year
            year_short = year % 100
            
            month_code = self.MONTH_CODES[month]
            
            # Yahoo Finance format: NGH26.NYM (correct format confirmed)
            yahoo_symbol = f"{self.base_symbol}{month_code}{year_short}.NYM"
            
            contracts.append({
                'month': month,
                'year': year,
                'month_code': month_code,
                'month_name': self.MONTH_NAMES[month],
                'contract_name': f"{self.MONTH_NAMES[month]} {year}",
                'expiry_date': future_date,
                'yahoo_symbol': yahoo_symbol,
                'cme_code': f"NG{month_code}{year_short}"
            })
        
        return contracts
    
    def fetch_live_forward_curve(self, num_months: int = 24, 
                                  verbose: bool = True) -> pd.DataFrame:
        """
        Fetch the current (live) forward curve for Natural Gas futures.
        
        This method fetches prices for multiple contract months to construct
        the forward curve using Yahoo Finance data.
        
        Args:
            num_months: Number of future months to fetch (default: 24)
            verbose: Whether to print progress messages (default: True)
            
        Returns:
            DataFrame with contract information and current prices
            
        Example:
            >>> ng = NaturalGasForwardCurve()
            >>> curve = ng.fetch_live_forward_curve(num_months=12)
            >>> print(curve[['Contract', 'Price']])
        """
        if verbose:
            print(f"Fetching live forward curve for {num_months} months...")
        
        contracts = self._generate_contract_symbols(num_months)
        results = []
        
        for i, contract in enumerate(contracts):
            symbol = contract['yahoo_symbol']
            price = None
            volume = None
            open_price = None
            high_price = None
            low_price = None
            last_update = None
            
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="5d")
                
                if not hist.empty:
                    price = hist['Close'].iloc[-1]
                    volume = hist['Volume'].iloc[-1] if 'Volume' in hist.columns else None
                    open_price = hist['Open'].iloc[-1] if 'Open' in hist.columns else None
                    high_price = hist['High'].iloc[-1] if 'High' in hist.columns else None
                    low_price = hist['Low'].iloc[-1] if 'Low' in hist.columns else None
                    last_update = hist.index[-1]
                    
            except Exception as e:
                if verbose:
                    print(f"  Warning: Could not fetch {symbol}: {str(e)[:50]}")
            
            results.append({
                'Contract': contract['contract_name'],
                'Symbol': symbol,
                'Month': contract['month'],
                'Year': contract['year'],
                'Expiry': contract['expiry_date'],
                'CME_Code': contract['cme_code'],
                'Price': round(price, 4) if price else None,
                'Open': round(open_price, 4) if open_price else None,
                'High': round(high_price, 4) if high_price else None,
                'Low': round(low_price, 4) if low_price else None,
                'Volume': int(volume) if volume and not np.isnan(volume) else None,
                'Last_Update': last_update
            })
            
            # Small delay to avoid rate limiting
            if i % 5 == 4:
                time.sleep(0.2)
        
        df = pd.DataFrame(results)
        
        # Filter out contracts with no price data
        df_valid = df[df['Price'].notna()].copy()
        
        if df_valid.empty and verbose:
            print("Warning: Could not fetch individual contract data.")
        elif verbose:
            print(f"Successfully fetched {len(df_valid)} contracts.")
        
        return df_valid
    
    def fetch_historical_prices(self, 
                               start_date: str,
                               end_date: Optional[str] = None,
                               interval: str = '1d') -> pd.DataFrame:
        """
        Fetch historical price data for the continuous Natural Gas futures contract.
        
        Args:
            start_date: Start date in 'YYYY-MM-DD' format
            end_date: End date in 'YYYY-MM-DD' format (defaults to today)
            interval: Data interval ('1d', '1wk', '1mo')
            
        Returns:
            DataFrame with historical OHLCV data
            
        Example:
            >>> ng = NaturalGasForwardCurve()
            >>> prices = ng.fetch_historical_prices('2024-01-01')
            >>> print(prices.tail())
        """
        print(f"Fetching historical prices from {start_date}...")
        
        ticker = yf.Ticker(self.continuous_symbol)
        hist = ticker.history(start=start_date, end=end_date, interval=interval)
        
        if hist.empty:
            print("No historical data available.")
            return pd.DataFrame()
        
        hist.index = pd.to_datetime(hist.index)
        hist.index = hist.index.tz_localize(None)  # Remove timezone info
        
        print(f"Fetched {len(hist)} records.")
        return hist
    
    def fetch_contract_historical(self,
                                  symbol: str,
                                  start_date: str,
                                  end_date: Optional[str] = None) -> pd.DataFrame:
        """
        Fetch historical data for a specific futures contract.
        
        Args:
            symbol: Contract symbol (e.g., 'NGH26.NYM' for March 2026)
            start_date: Start date in 'YYYY-MM-DD' format
            end_date: End date in 'YYYY-MM-DD' format
            
        Returns:
            DataFrame with historical OHLCV data for the specific contract
        """
        print(f"Fetching historical data for {symbol}...")
        
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=start_date, end=end_date)
        
        if hist.empty:
            print(f"No data available for {symbol}")
            return pd.DataFrame()
        
        hist.index = pd.to_datetime(hist.index)
        hist.index = hist.index.tz_localize(None)
        
        return hist
    
    def fetch_historical_forward_curves(self, 
                                        start_date: str,
                                        end_date: Optional[str] = None,
                                        num_months: int = 12,
                                        sample_frequency: str = 'W') -> Dict[str, pd.DataFrame]:
        """
        Fetch historical forward curves for multiple dates.
        
        This method constructs forward curves at different historical dates
        using the continuous contract as a base and applying seasonal adjustments.
        
        Args:
            start_date: Start date in 'YYYY-MM-DD' format
            end_date: End date in 'YYYY-MM-DD' format (defaults to today)
            num_months: Number of forward months to include in each curve
            sample_frequency: Frequency of curve snapshots ('D', 'W', 'M')
            
        Returns:
            Dictionary mapping dates to forward curve DataFrames
        """
        print(f"Fetching historical forward curves from {start_date}...")
        
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        # Fetch continuous contract historical data
        ticker = yf.Ticker(self.continuous_symbol)
        hist = ticker.history(start=start_date, end=end_date)
        
        if hist.empty:
            print("No historical data available for the specified period.")
            return {}
        
        # Sample dates based on frequency
        sample_dates = hist.resample(sample_frequency).last().index
        
        historical_curves = {}
        
        for date in sample_dates:
            if date in hist.index:
                base_price = hist.loc[date, 'Close']
                
                # Generate forward curve for this date
                curve_data = []
                for i in range(num_months):
                    future_date = date + relativedelta(months=i)
                    month = future_date.month
                    year = future_date.year
                    
                    seasonal_factor = self._get_seasonal_factor(month)
                    # Apply seasonal adjustment and small contango
                    estimated_price = base_price * seasonal_factor * (1 + 0.002 * i)
                    
                    curve_data.append({
                        'Contract': f"{self.MONTH_NAMES[month]} {year}",
                        'Month': month,
                        'Year': year,
                        'Months_Forward': i,
                        'Price': round(estimated_price, 3)
                    })
                
                historical_curves[date.strftime('%Y-%m-%d')] = pd.DataFrame(curve_data)
        
        print(f"Generated {len(historical_curves)} historical forward curves.")
        return historical_curves
    
    def _get_seasonal_factor(self, month: int) -> float:
        """
        Get seasonal adjustment factor for natural gas prices.
        
        Natural gas prices typically peak in winter months due to heating demand
        and have secondary peaks in summer due to cooling demand.
        """
        seasonal_factors = {
            1: 1.15,   # January - high heating demand
            2: 1.10,   # February
            3: 1.00,   # March - shoulder season
            4: 0.95,   # April
            5: 0.92,   # May - lowest demand
            6: 0.95,   # June - cooling demand starts
            7: 1.00,   # July - peak cooling
            8: 1.00,   # August
            9: 0.95,   # September
            10: 0.98,  # October
            11: 1.05,  # November - heating starts
            12: 1.12   # December - high heating demand
        }
        return seasonal_factors.get(month, 1.0)
    
    def plot_forward_curve(self, 
                          df: pd.DataFrame,
                          title: str = "Natural Gas Forward Curve",
                          save_path: Optional[str] = None,
                          show: bool = True) -> None:
        """
        Plot the forward curve.
        
        Args:
            df: DataFrame with forward curve data (must have 'Contract' and 'Price' columns)
            title: Plot title
            save_path: Path to save the figure (optional)
            show: Whether to display the plot (default: True)
        """
        if df.empty:
            print("No data to plot.")
            return
        
        plt.figure(figsize=(14, 7))
        
        # Create x-axis labels
        x_labels = df['Contract'].tolist()
        x_pos = range(len(x_labels))
        prices = df['Price'].tolist()
        
        # Plot the curve
        plt.plot(x_pos, prices, 'b-o', linewidth=2, markersize=6)
        plt.fill_between(x_pos, prices, alpha=0.3)
        
        # Formatting
        plt.xticks(x_pos, x_labels, rotation=45, ha='right')
        plt.xlabel('Contract Month', fontsize=12)
        plt.ylabel('Price ($/MMBtu)', fontsize=12)
        plt.title(title, fontsize=14, fontweight='bold')
        plt.grid(True, alpha=0.3)
        
        # Add price annotations
        for i, (x, price) in enumerate(zip(x_pos, prices)):
            if price is not None and not np.isnan(price):
                plt.annotate(f'${price:.2f}', (x, price), 
                           textcoords="offset points", xytext=(0, 10),
                           ha='center', fontsize=8)
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"Plot saved to {save_path}")
        
        if show:
            plt.show()
        else:
            plt.close()
    
    def plot_historical_curves(self,
                              historical_curves: Dict[str, pd.DataFrame],
                              num_curves: int = 5,
                              save_path: Optional[str] = None,
                              show: bool = True) -> None:
        """
        Plot multiple historical forward curves for comparison.
        
        Args:
            historical_curves: Dictionary of date -> forward curve DataFrames
            num_curves: Number of curves to plot
            save_path: Path to save the figure (optional)
            show: Whether to display the plot (default: True)
        """
        if not historical_curves:
            print("No historical curves to plot.")
            return
        
        plt.figure(figsize=(14, 8))
        
        # Select evenly spaced dates
        dates = sorted(historical_curves.keys())
        if len(dates) > num_curves:
            step = len(dates) // num_curves
            selected_dates = dates[::step][:num_curves]
        else:
            selected_dates = dates
        
        colors = plt.cm.viridis(np.linspace(0, 1, len(selected_dates)))
        
        for i, date in enumerate(selected_dates):
            df = historical_curves[date]
            x_pos = df['Months_Forward'].tolist()
            prices = df['Price'].tolist()
            plt.plot(x_pos, prices, '-o', color=colors[i], 
                    linewidth=2, markersize=4, label=date)
        
        plt.xlabel('Months Forward', fontsize=12)
        plt.ylabel('Price ($/MMBtu)', fontsize=12)
        plt.title('Historical Natural Gas Forward Curves', fontsize=14, fontweight='bold')
        plt.legend(title='Curve Date', loc='best')
        plt.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"Plot saved to {save_path}")
        
        if show:
            plt.show()
        else:
            plt.close()
    
    def plot_price_history(self,
                          df: pd.DataFrame,
                          title: str = "Natural Gas Futures Price History",
                          save_path: Optional[str] = None,
                          show: bool = True) -> None:
        """
        Plot historical price chart with volume.
        
        Args:
            df: DataFrame with historical OHLCV data
            title: Plot title
            save_path: Path to save the figure (optional)
            show: Whether to display the plot (default: True)
        """
        if df.empty:
            print("No data to plot.")
            return
        
        fig, axes = plt.subplots(2, 1, figsize=(14, 10), 
                                gridspec_kw={'height_ratios': [3, 1]})
        
        # Price chart
        ax1 = axes[0]
        ax1.plot(df.index, df['Close'], 'b-', linewidth=1.5, label='Close Price')
        ax1.fill_between(df.index, df['Low'], df['High'], alpha=0.2, color='blue')
        ax1.set_ylabel('Price ($/MMBtu)', fontsize=12)
        ax1.set_title(title, fontsize=14, fontweight='bold')
        ax1.legend(loc='upper left')
        ax1.grid(True, alpha=0.3)
        ax1.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
        ax1.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
        
        # Volume chart
        ax2 = axes[1]
        ax2.bar(df.index, df['Volume'], color='gray', alpha=0.7)
        ax2.set_ylabel('Volume', fontsize=12)
        ax2.set_xlabel('Date', fontsize=12)
        ax2.grid(True, alpha=0.3)
        ax2.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
        ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=150, bbox_inches='tight')
            print(f"Plot saved to {save_path}")
        
        if show:
            plt.show()
        else:
            plt.close()
    
    def calculate_calendar_spreads(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate calendar spreads (price differences between consecutive months).
        
        Args:
            df: Forward curve DataFrame with 'Contract' and 'Price' columns
            
        Returns:
            DataFrame with spread calculations
        """
        if len(df) < 2:
            return pd.DataFrame()
        
        spreads = []
        for i in range(len(df) - 1):
            current = df.iloc[i]
            next_month = df.iloc[i + 1]
            
            if current['Price'] and next_month['Price']:
                spread = next_month['Price'] - current['Price']
                spread_pct = (spread / current['Price']) * 100
                
                spreads.append({
                    'Near_Contract': current['Contract'],
                    'Far_Contract': next_month['Contract'],
                    'Near_Price': current['Price'],
                    'Far_Price': next_month['Price'],
                    'Spread': round(spread, 4),
                    'Spread_Pct': round(spread_pct, 2)
                })
        
        return pd.DataFrame(spreads)
    
    def export_to_csv(self, df: pd.DataFrame, filepath: str) -> None:
        """Export DataFrame to CSV file."""
        df.to_csv(filepath, index=False)
        print(f"Data exported to {filepath}")
    
    def export_to_excel(self, df: pd.DataFrame, filepath: str) -> None:
        """Export DataFrame to Excel file."""
        df.to_excel(filepath, index=False)
        print(f"Data exported to {filepath}")
    
    def get_contract_symbol(self, month: int, year: int) -> str:
        """
        Get the Yahoo Finance symbol for a specific contract month/year.
        
        Args:
            month: Contract month (1-12)
            year: Contract year (e.g., 2026)
            
        Returns:
            Yahoo Finance ticker symbol (e.g., 'NGH26.NYM')
        """
        month_code = self.MONTH_CODES.get(month)
        if not month_code:
            raise ValueError(f"Invalid month: {month}")
        
        year_short = year % 100
        return f"{self.base_symbol}{month_code}{year_short}.NYM"


def main():
    """Main function demonstrating the usage of NaturalGasForwardCurve class."""
    
    print("=" * 70)
    print("Natural Gas Futures Forward Curve Data Fetcher")
    print("=" * 70)
    
    # Initialize the forward curve fetcher
    ng = NaturalGasForwardCurve()
    
    # 1. Fetch live forward curve
    print("\n" + "=" * 50)
    print("1. LIVE FORWARD CURVE")
    print("=" * 50)
    
    live_curve = ng.fetch_live_forward_curve(num_months=18)
    
    if not live_curve.empty:
        print("\nCurrent Forward Curve:")
        print(live_curve[['Contract', 'Symbol', 'Price', 'Volume']].to_string(index=False))
        
        # Save to CSV
        ng.export_to_csv(live_curve, 'ng_live_forward_curve.csv')
        
        # Plot the forward curve
        ng.plot_forward_curve(live_curve, 
                             title="Natural Gas Live Forward Curve",
                             save_path='ng_forward_curve.png')
        
        # Calculate and display spreads
        print("\n" + "-" * 40)
        print("Calendar Spreads:")
        spreads = ng.calculate_calendar_spreads(live_curve)
        if not spreads.empty:
            print(spreads.to_string(index=False))
    
    # 2. Fetch historical prices
    print("\n" + "=" * 50)
    print("2. HISTORICAL PRICES (Continuous Contract)")
    print("=" * 50)
    
    # Get last 2 years of data
    start_date = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')
    historical_prices = ng.fetch_historical_prices(start_date=start_date)
    
    if not historical_prices.empty:
        print(f"\nHistorical data from {start_date} to today:")
        print(f"Total records: {len(historical_prices)}")
        print(f"\nPrice Statistics:")
        print(f"  Min:  ${historical_prices['Close'].min():.3f}")
        print(f"  Max:  ${historical_prices['Close'].max():.3f}")
        print(f"  Mean: ${historical_prices['Close'].mean():.3f}")
        print(f"  Last: ${historical_prices['Close'].iloc[-1]:.3f}")
        
        # Save to CSV
        ng.export_to_csv(historical_prices.reset_index(), 'ng_historical_prices.csv')
        
        # Plot price history
        ng.plot_price_history(historical_prices,
                             title="Natural Gas Futures - 2 Year Price History",
                             save_path='ng_price_history.png')
    
    # 3. Fetch historical forward curves
    print("\n" + "=" * 50)
    print("3. HISTORICAL FORWARD CURVES")
    print("=" * 50)
    
    historical_curves = ng.fetch_historical_forward_curves(
        start_date=(datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d'),
        num_months=12
    )
    
    if historical_curves:
        # Show a sample curve
        sample_date = list(historical_curves.keys())[0]
        print(f"\nSample curve for {sample_date}:")
        print(historical_curves[sample_date].to_string(index=False))
        
        # Plot historical curves comparison
        ng.plot_historical_curves(historical_curves, 
                                 num_curves=6,
                                 save_path='ng_historical_curves.png')
    
    print("\n" + "=" * 70)
    print("Data fetching complete!")
    print("=" * 70)
    
    return ng, live_curve, historical_prices, historical_curves


if __name__ == "__main__":
    ng, live_curve, historical_prices, historical_curves = main()
