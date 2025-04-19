// src/services/tokenDiscoveryService.ts
import { schedule } from 'node-cron';
import logger from '../utils/logger.js';
import db from '../db/index.js';
import config from '../config/index.js';

// Define interfaces for the token data
interface NewTokenRow {
  id: number;
  chain_type: string;
  contract_address: string;
  discovered_at: string;
  processed: boolean;
}

// Function to discover new tokens
export async function discoverNewTokens() {
  logger.info('Discovering new tokens...');
  
  try {
    // 1. Get unprocessed new tokens
    const result = await db.query<NewTokenRow>(`
      SELECT id, chain_type, contract_address 
      FROM new_tokens_raw 
      WHERE processed = false
    `, []);
    
    for (const newToken of result.rows) {
      logger.info(`Processing new token: ${newToken.contract_address}`);
      
      // Check if the token is already in the tokens table
      const tokenCheck = await db.query<{id: number}>(`
        SELECT id FROM tokens WHERE contract_address = ?
      `, [newToken.contract_address]);
      
      if (tokenCheck.rows.length === 0) {
        // In a real implementation, you would:
        // 1. Query on-chain for token metadata (name, symbol, decimals)
        // 2. Check if the token has sufficient liquidity
        
        // For this example, we'll insert with mock data
        await db.query<never>(`
          INSERT INTO tokens (
            name, symbol, decimals, logo, contract_address
          )
          VALUES (?, ?, ?, ?, ?)
        `, [
          `Token ${newToken.contract_address.substring(0, 8)}`,
          `TKN${newToken.contract_address.substring(0, 4)}`,
          18,
          null,
          newToken.contract_address
        ]);
        
        logger.info(`Added new token: ${newToken.contract_address}`);
      }
      
      // Mark the token as processed
      await db.query<never>(`
        UPDATE new_tokens_raw
        SET processed = true
        WHERE id = ?
      `, [newToken.id]);
    }
    
    logger.info('Token discovery completed successfully');
  } catch (error) {
    logger.error('Failed to discover new tokens', error);
  }
}

// Start the scheduled tasks
export function startTokenDiscoveryService() {
  // Discover new tokens every 2 hours
  schedule(config.cron.discoverTokensInterval || '0 */2 * * *', discoverNewTokens);
  
  logger.info('Token discovery service scheduled successfully');
}