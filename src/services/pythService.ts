// src/services/pythService.ts
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import db from '../db/index.js';
import config from '../config/index.js';
import { PriceRawRow } from '../types.js';

const execAsync = promisify(exec);
let substreamsAvailable = false;
let lastPriceUpdateTime = 0;
const PRICE_STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function setupPythSubstreams() {
  try {
    // Check if substreams CLI is installed
    try {
      const { stdout } = await execAsync('substreams --version');
      logger.info(`Substreams CLI found: ${stdout.trim()}`);
      substreamsAvailable = true;
    } catch (error) {
      logger.warn('Substreams CLI not found. Will use Pyth REST API as fallback.');
      substreamsAvailable = false;
    }

    logger.info('Pyth setup completed successfully');
  } catch (error) {
    logger.error('Failed to setup Pyth data sources', error);
    throw error;
  }
}

export async function startPythDataIngestion() {
  logger.info('Starting Pyth data ingestion process');
  
  // Per your request, prioritize StreamingFast/Substreams if available
  if (substreamsAvailable && config.substreams.apiToken) {
    logger.info('Using Substreams as primary data source');
    startSubstreamsIngestion();
  } else {
    logger.info('Substreams not available, using Pyth REST API');
    setupPythRestApi();
  }
}

// Start a daemon to check for price staleness
function startStalenessDaemon() {
  setInterval(checkPriceStaleness, 60000); // Check every minute
}

// Check if prices are stale and log alerts
async function checkPriceStaleness() {
  try {
    const now = Date.now();
    const latestPrices = await getLatestPythPrices();
    
    for (const price of latestPrices) {
      const priceTime = new Date(price.publish_time).getTime();
      const ageMs = now - priceTime;
      
      if (ageMs > PRICE_STALENESS_THRESHOLD_MS) {
        logger.error(`PRICE ALERT: ${price.price_id} price is stale (${Math.floor(ageMs/1000/60)} minutes old)`);
        // In a production system, you would send an alert to monitoring systems
        // alerting.sendAlert('price_stale', { priceId: price.price_id, ageMinutes: Math.floor(ageMs/1000/60) });
      }
    }
    
    if (now - lastPriceUpdateTime > PRICE_STALENESS_THRESHOLD_MS) {
      logger.error(`SYSTEM ALERT: No price updates received in ${Math.floor((now - lastPriceUpdateTime)/1000/60)} minutes`);
      // alerting.sendAlert('price_update_failure', { minutes: Math.floor((now - lastPriceUpdateTime)/1000/60) });
    }
  } catch (error) {
    logger.error('Error checking price staleness', error);
  }
}

// New function to fetch prices from Pyth's REST API
// Updated fetchPythPricesFeed function
async function fetchPythPricesFeed() {
  try {
    // List of asset price feeds with symbols for easier identification
    const priceFeeds = [
      { id: 'Crypto.BTC/USD', symbol: 'BTC/USD' },
      { id: 'Crypto.ETH/USD', symbol: 'ETH/USD' },
      { id: 'Crypto.SEI/USD', symbol: 'SEI/USD' },
      { id: 'Crypto.SOL/USD', symbol: 'SOL/USD' },
      { id: 'Crypto.USDT/USD', symbol: 'USDT/USD' }
    ];

    // Using the Pyth Price Service API
    const url = 'https://xc-mainnet.pyth.network/api/latest_price_feeds';
    
    logger.info(`Fetching from Pyth Price Service: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Pyth API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    let updatedCount = 0;
    
    // Process each price feed
    for (const feed of data) {
      // Match price feed by symbol
      const matchedFeed = priceFeeds.find(pf => 
        feed.symbol && feed.symbol.includes(pf.id)
      );
      
      if (matchedFeed && feed.price) {
        const price = feed.price.price;
        const conf = feed.price.confidence;
        const expo = feed.price.expo;
        const publishTime = new Date().toISOString(); // Use current time as publish time
        const symbol = matchedFeed.symbol;
        
        const realPrice = price * Math.pow(10, expo);
        logger.info(`Received Pyth price for ${symbol}: $${realPrice.toFixed(4)}`);
        
        await db.query<PriceRawRow>(`
          INSERT INTO prices_raw (
            price_id, price, conf, expo, publish_time
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          symbol,
          price,
          conf, 
          expo,
          publishTime
        ]);
        
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      lastPriceUpdateTime = Date.now();
      return true;
    } else {
      logger.warn('No price updates received from Pyth API');
      return false;
    }
  } catch (error) {
    logger.error('Error fetching Pyth price feeds', error);
    
    // As a fallback, let's try CoinGecko
    try {
      logger.info('Trying CoinGecko as fallback');
      const success = await fetchCoinGeckoPrices();
      return success;
    } catch (geckoError) {
      logger.error('CoinGecko fallback also failed', geckoError);
      return false;
    }
  }
}

// Add a CoinGecko fallback
async function fetchCoinGeckoPrices() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,sei-network,solana,tether&vs_currencies=usd&include_last_updated_at=true');
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }
    
    interface CoinGeckoPrice {
      usd: number;
      last_updated_at?: number;
    }
    
    const data = await response.json() as Record<string, CoinGeckoPrice>;
    
    // Map CoinGecko IDs to our price_ids
    const idMap: Record<string, string> = {
      'bitcoin': 'BTC/USD',
      'ethereum': 'ETH/USD', 
      'sei-network': 'SEI/USD',
      'solana': 'SOL/USD',
      'tether': 'USDT/USD'
    };
    
    let updatedCount = 0;
    
    for (const [cgId, cgData] of Object.entries(data)) {
      if (!(cgId in idMap)) continue;
      
      const priceId = idMap[cgId];
      const price = cgData.usd;
      const updatedAt = cgData.last_updated_at ? 
        new Date(cgData.last_updated_at * 1000).toISOString() : 
        new Date().toISOString();
      
      logger.info(`Received CoinGecko price for ${priceId}: $${price}`);
      
      await db.query<PriceRawRow>(`
        INSERT INTO prices_raw (
          price_id, price, conf, expo, publish_time
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        priceId,
        price * 1e8, // Convert to Pyth format (8 decimal points)
        price * 1e6, // Rough approximation of confidence
        -8, // Standard exponent for USD prices
        updatedAt
      ]);
      
      updatedCount++;
    }
    
    if (updatedCount > 0) {
      lastPriceUpdateTime = Date.now();
      return true;
    } else {
      logger.warn('No price updates received from CoinGecko');
      return false;
    }
  } catch (error) {
    logger.error('Error fetching CoinGecko prices', error);
    return false;
  }
}

// Separate function for Substreams approach
function startSubstreamsIngestion() {
  const command = [
    'substreams',
    'run',
    `--endpoint=${config.substreams.endpoint}`,
    `--manifest=${config.substreams.manifestPath}`,
    config.substreams.startBlock ? `--start-block=${config.substreams.startBlock}` : '',
    '--output=jsonl',
    'store_set_oracle_prices'
  ].filter(Boolean);
  
  logger.info(`Running command: ${command.join(' ')}`);
  
  try {
    const process = spawn(command[0], command.slice(1));
    
    process.stdout.on('data', async (data) => {
      try {
        // Parse each line as JSON
        const lines = data.toString().trim().split('\n');
        let updatedCount = 0;
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const jsonData = JSON.parse(line);
            
            // Check if this is a price update
            if (jsonData.value && jsonData.value.price_id) {
              logger.info(`Received price update for ${jsonData.value.price_id}`);
              
              // Insert into database
              await db.query<PriceRawRow>(`
                INSERT INTO prices_raw (
                  price_id, price, conf, expo, publish_time
                ) VALUES (?, ?, ?, ?, ?)
              `, [
                jsonData.value.price_id,
                jsonData.value.price,
                jsonData.value.conf,
                jsonData.value.expo,
                new Date(jsonData.value.publish_time * 1000).toISOString()
              ]);
              
              updatedCount++;
            }
          } catch (parseError: any) {
            logger.warn(`Failed to parse JSON: ${parseError.message}`);
          }
        }
        
        if (updatedCount > 0) {
          lastPriceUpdateTime = Date.now();
        }
      } catch (error) {
        logger.error('Error processing Substreams data', error);
      }
    });
    
    process.stderr.on('data', (data) => {
      logger.warn(`Substreams stderr: ${data}`);
    });
    
    process.on('error', (err) => {
      logger.error(`Failed to start Substreams process: ${err.message}`);
      logger.info('Falling back to Pyth REST API');
      setupPythRestApi();
    }); 
    
    process.on('close', (code) => {
      logger.info(`Substreams process exited with code ${code}`);
      // Restart the process after a delay
      setTimeout(() => startSubstreamsIngestion(), 5000);
    });
    
    logger.info('Pyth Substreams data ingestion started');
    
    // Also start the staleness checker
    startStalenessDaemon();
  } catch (error) {
    logger.error('Error starting Substreams process', error);
    logger.info('Falling back to Pyth REST API');
    setupPythRestApi();
  }
}

function setupPythRestApi() {
  fetchPythPricesFeed().then(success => {
    if (success) {
      setInterval(async () => {
        const fetchSuccess = await fetchPythPricesFeed();
        if (!fetchSuccess) {
          logger.error('Pyth REST API failed to fetch prices');
        }
      }, 30000);
      logger.info('Pyth REST API data ingestion started');
    } else {
      logger.error('All price data sources have failed');
    }
    
    // Start staleness checker regardless of success
    startStalenessDaemon();
  });
}

export async function getLatestPythPrices(): Promise<PriceRawRow[]> {
  try {
    const result = await db.query<PriceRawRow>(`
      SELECT price_id, price, conf, expo, publish_time 
      FROM prices_raw 
      GROUP BY price_id
      ORDER BY publish_time DESC
    `, []);
    
    return result.rows;
  } catch (error) {
    logger.error('Failed to get latest Pyth prices', error);
    throw error;
  }
}

export async function getPythPriceById(priceId: string): Promise<PriceRawRow | null> {
  try {
    const result = await db.query<PriceRawRow>(`
      SELECT price_id, price, conf, expo, publish_time 
      FROM prices_raw 
      WHERE price_id = ?
      ORDER BY publish_time DESC
      LIMIT 1
    `, [priceId]);
    
    return result.rows[0] || null;
  } catch (error) {
    logger.error(`Failed to get Pyth price for ID: ${priceId}`, error);
    throw error;
  }
}