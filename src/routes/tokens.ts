// src/routes/tokens.ts
import express from 'express';
import db from '../db/index.js';
import logger from '../utils/logger.js';
import { TokenRow } from '../types.js';

const router = express.Router();

// GET /tokens
router.get('/', async (req, res) => {
  try {
    const tokens = await db.query<TokenRow>('SELECT * FROM tokens', []);
    
    const response = {
      data: tokens.rows.map(token => ({
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logo: token.logo,
        contractAddress: token.contract_address,
        currentPrice: null,
        priceUpdatedAt: new Date().toISOString(),
        last24hVariation: null,
        info: {
          sells: 0,
          buys: 0,
          bondedAt: null
        }
      })),
      meta: {
        page: 1,
        limit: 50,
        totalItemsCount: tokens.rows.length,
        pagesCount: 1
      }
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error fetching tokens', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;