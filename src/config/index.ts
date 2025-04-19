// src/config/index.ts
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'sei_prices',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  substreams: {
    endpoint: process.env.SUBSTREAMS_ENDPOINT || 'evm-mainnet.sei.streamingfast.io:443',
    apiToken: process.env.SUBSTREAMS_API_TOKEN || '',
    manifestPath: process.env.SUBSTREAMS_MANIFEST_PATH || join(__dirname, '../../substreams.yaml'),
    startBlock: parseInt(process.env.SUBSTREAMS_START_BLOCK || '0', 10),
  },
  cron: {
    updatePricesInterval: process.env.UPDATE_PRICES_INTERVAL || '*/5 * * * *', // every 5 minutes
    rollup24hInterval: process.env.ROLLUP_24H_INTERVAL || '0 * * * *', // every hour
    discoverTokensInterval: process.env.DISCOVER_TOKENS_INTERVAL || '0 */2 * * *', // every 2 hours
  },
  prices: {
    liquidityThreshold: parseFloat(process.env.LIQUIDITY_THRESHOLD || '25000'), // $25k min liquidity
    priceTTL: parseInt(process.env.PRICE_TTL || '1800', 10), // 30 minutes in seconds
  },
};