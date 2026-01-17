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
