// src/services/priceAPIs.ts
import logger from '../utils/logger.js';
import db from '../db/index.js';
import { PriceRawRow } from '../types.js';

export async function fetchPythPricesFeed() {
  try {
    // List of asset price feeds
    const pythIds = [
      'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
      'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
      'cf64512283d61c8d5fce267db286c1f43fbf07abe5709a7e100c1b6ad801e5b8', // SOL/USD
      '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b', // USDT/USD
      'a0cd63e975ef8c038755022616439c8fc15cb9d6c20ba2e8d9cafdefba7d1def'  // SEI/USD
    ];

    // Fetch from Pyth API
    const response = await fetch(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${pythIds.join('&ids[]=')}`);
    
    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.statusText}`);
    }
    
    const feeds = await response.json();
    
    // Map Pyth IDs to human-readable symbols
    const idToSymbol: Record<string, string> = {
      'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43': 'BTC/USD',
      'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace': 'ETH/USD',
      'cf64512283d61c8d5fce267db286c1f43fbf07abe5709a7e100c1b6ad801e5b8': 'SOL/USD',
      '2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b': 'USDT/USD',
      'a0cd63e975ef8c038755022616439c8fc15cb9d6c20ba2e8d9cafdefba7d1def': 'SEI/USD'
    };
    
    for (const feed of feeds) {
      const pythId = feed.id as string;
      const priceId = pythId in idToSymbol ? idToSymbol[pythId] : `PYTH:${pythId.slice(0, 8)}`;
      
      if (feed.price) {
        const price = feed.price.price;
        const conf = feed.price.conf;
        const expo = feed.price.expo;
        const publishTime = new Date(feed.price.publish_time * 1000).toISOString();
        
        const realPrice = price * Math.pow(10, expo);
        logger.info(`Received Pyth price for ${priceId}: $${realPrice.toFixed(4)}`);
        
        await db.query<PriceRawRow>(`
          INSERT INTO prices_raw (
            price_id, price, conf, expo, publish_time
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          priceId,
          price,
          conf, 
          expo,
          publishTime
        ]);
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Error fetching Pyth price feeds', error);
    return false;
  }
}