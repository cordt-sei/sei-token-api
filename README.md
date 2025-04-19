# Sei Token Price Oracle

A reliable, fault-tolerant price oracle service that fetches, stores, and serves cryptocurrency price data with a focus on Sei blockchain tokens.

## Overview

This service aggregates token price data from multiple sources with a tiered fallback strategy:

1. **Primary**: StreamingFast Substreams (on-chain events)
2. **Fallback**: Pyth Network Price API
3. **Secondary Fallback**: CoinGecko API

Price data is stored in a local database and exposed via REST API endpoints.

## Features

- Multi-source price data with automatic failover
- Price staleness detection and alerting
- 5-minute interval token price updates
- SQLite storage (configurable)
- REST API for token and price data access
- TypeScript implementation with strong typing

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/sei-token-price-oracle.git
cd sei-token-price-oracle

# Install dependencies
yarn install

# Build the application
yarn build
```

## Configuration

Create a `.env` file in the project root:

```ini
PORT=3000
NODE_ENV=development

# Substreams Configuration (optional)
SUBSTREAMS_ENDPOINT=evm-mainnet.sei.streamingfast.io:443
SUBSTREAMS_API_TOKEN=your_streamingfast_api_token
SUBSTREAMS_MANIFEST_PATH=./substreams.yaml
SUBSTREAMS_START_BLOCK=1000

# Price Service Configuration
PRICE_TTL=1800
```

## Starting the Service

```bash
yarn start
```

The service will:

1. Initialize the database
2. Check for Substreams CLI availability
3. Start price data ingestion from available sources
4. Begin the scheduled 5-minute price updates
5. Expose the REST API endpoints

## API Endpoints

### Health Check

```ini
GET /health
```

Response: `{"status":"ok"}`

### Token List

```ini
GET /tokens
```

Returns a list of tracked tokens with metadata.

### Latest Prices

```ini
GET /prices
```

Returns the most recent price data for all tracked tokens.

## Architecture

### Components

1. **Price Data Sources**:
   - StreamingFast Substreams integration for on-chain price data
   - Pyth Network Price API for cross-chain price feeds
   - CoinGecko API as final fallback

2. **Data Storage**:
   - SQLite database with tables for tokens, raw prices, and 5-minute snapshots
   - Optimized for time-series price data

3. **Services**:
   - `pythService.ts`: Price data ingestion from multiple sources
   - `priceService.ts`: Scheduled price updates and aggregation
   - `tokenDiscoveryService.ts`: Token metadata management

4. **API Layer**:
   - Express.js REST API for data access
   - JSON response format

### Data Flow

1. Price data is fetched from available sources on 30-second intervals
2. Valid price data is stored in the `prices_raw` table
3. Every 5 minutes, latest prices are processed and stored in `prices_5m`
4. API endpoints query the database to serve this data to clients

## Adding New Price Feeds

To add a new token price feed:

- Add the token to the database:

```sql
INSERT INTO tokens (name, symbol, decimals, contract_address)
VALUES ('New Token', 'NTK', 18, '0xnew_token_contract_address');
```

- Update the price source mappings in `pythService.ts` to include the new token.

## Customization

- **Database**: Replace SQLite with PostgreSQL/TimescaleDB for production
- **Monitoring**: Add Prometheus metrics in the Express server for monitoring
- **Alert Integration**: Implement proper alert systems in the staleness checker

## Requirements

- Node.js 16+
- TypeScript 4+
- Substreams CLI (optional, for primary data source)

## License

MIT
