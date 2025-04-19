// src/services/priceService.ts
import { schedule } from 'node-cron';
import logger from '../utils/logger.js';
import db from '../db/index.js';
import config from '../config/index.js';
import { getLatestPythPrices } from './pythService.js';
import { TokenRow, Price5mRow, PriceRawRow } from '../types.js';

// Function to update 5-minute price snapshots
export async function updateSpotPrices() {
  logger.info('Updating spot prices...');
  
  try {
    // 1. Get all tokens
    const tokens = await db.query<TokenRow>('SELECT id, contract_address, symbol FROM tokens', []);
    
    // 2. Get latest prices from Pyth
    const pythPrices = await getLatestPythPrices();
    const priceMap = new Map<string, PriceRawRow>();
    
    // Create a map of price_id to price
    pythPrices.forEach(price => {
      priceMap.set(price.price_id, price);
    });
    
    // Process all tokens
    for (const token of tokens.rows) {
      // For this POC, we'll map tokens to price feeds by symbol
      // In a real implementation, you'd have a more robust mapping
      const priceId = `${token.symbol}/USD`;
      const pythPrice = priceMap.get(priceId);
      
      let price: number;
      let source: string;
      
      if (pythPrice) {
        // Calculate actual price using exponent
        price = pythPrice.price * Math.pow(10, pythPrice.expo);
        source = 'pyth';
        logger.info(`Found Pyth price for ${token.symbol}: ${price}`);
      } else {
        // Generate a mock price if no Pyth price is available
        price = Math.random() * 1000;
        source = 'mock';
        logger.info(`Using mock price for ${token.symbol}: ${price}`);
      }
      
      // Insert the price into the prices_5m table
      await db.query<never>(`
        INSERT INTO prices_5m (token_id, price, source)
        VALUES (?, ?, ?)
      `, [token.id, price, source]);
    }
    
    logger.info('Spot prices updated successfully');
  } catch (error) {
    logger.error('Failed to update spot prices', error);
  }
}

// Start the scheduled tasks
export function startPriceServices() {
  // Update prices every 5 minutes
  schedule(config.cron.updatePricesInterval || '*/5 * * * *', updateSpotPrices);
  
  // Initial update
  updateSpotPrices();
  
  logger.info('Price services scheduled successfully');
}