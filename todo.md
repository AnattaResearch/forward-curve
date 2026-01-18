# Project TODO

- [x] Create backend API to fetch natural gas futures data using yfinance
- [x] Create API endpoint for live forward curve data
- [x] Create API endpoint for historical price data
- [x] Create frontend UI with month selector input
- [x] Create interactive forward curve chart using Recharts
- [x] Create data table to display contract details
- [x] Add CSV download functionality
- [x] Add loading states and error handling
- [x] Style the application with professional design

# Bug Fixes

- [x] Replace Python data fetching with Node.js implementation for production compatibility
- [x] Use yahoo-finance2 npm package instead of Python yfinance
- [x] Update routers.ts to use new TypeScript data fetching module
- [x] Test data fetching in production-like environment

# New Features

- [x] Implement server-side caching with 5-minute TTL for API responses
- [x] Add volume visualization to forward curve chart (dual Y-axis)
- [x] Update chart to show both price line and volume bars
- [x] Add cache status badge showing when data was cached
- [x] Add cache status API endpoint

# Expiry Date Feature

- [x] Fetch contract expiry date from Yahoo Finance API
- [x] Display expiry date in data table
- [x] Include expiry date in CSV download

# Storage Optimization Feature

- [x] Research gas storage optimization algorithm (Static Intrinsic Valuation)
- [x] Create feature branch for storage optimization
- [x] Implement backend API for optimal injection/withdrawal calculation
- [x] Create facility parameters input form with default values
- [x] Implement optimal schedule calculation based on forward curve
- [x] Visualize optimal injection/withdrawal schedule
- [x] Visualize facility position (inventory) over time
- [x] Add unit tests for storage optimization
- [ ] Submit PR to GitHub repository

# gas_storage Package Integration

- [x] Create Python bridge script (gas_storage_bridge.py) for subprocess communication
- [x] Create TypeScript client module (gasStorageClient.ts) to call Python bridge
- [x] Update routers.ts to use gas_storage package instead of TypeScript implementation
- [x] Update frontend parameters to match gas_storage FacilityParams and OptimizationParams
- [x] Update frontend to display trade pairs (inject date → withdraw date) format
- [x] Add storage positions display using get_storage_positions()
- [x] Add requirements.txt for Python dependencies
- [x] Update package.json with Python install scripts
- [ ] Test integration end-to-end
- [ ] Submit PR for gas_storage integration
