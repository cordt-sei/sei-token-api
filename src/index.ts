// Update your src/index.ts file with these changes

import express, { Request, Response } from 'express';
import cors from 'cors';
import logger from './utils/logger.js';
import config from './config/index.js';
import tokensRoutes from './routes/tokens.js';
import { setupPythSubstreams, startPythDataIngestion } from './services/pythService.js';
import { startPriceServices } from './services/priceService.js';
import db from './db/index.js';
import { PriceRawRow } from './types.js';

async function bootstrap() {
  try {
    // Initialize the Express application
    const app = express();
    
    // Middleware
    app.use(express.json());
    app.use(cors());
    
    // Routes
    app.use('/tokens', tokensRoutes);
    
    // Add a route to check prices directly
    app.get('/prices', async (req: Request, res: Response) => {
      try {
        // This query ensures we get only the most recent price for each asset
        const result = await db.query<PriceRawRow>(`
          SELECT p1.price_id, p1.price, p1.conf, p1.expo, p1.publish_time
          FROM prices_raw p1
          INNER JOIN (
            SELECT price_id, MAX(publish_time) as max_time
            FROM prices_raw
            GROUP BY price_id
          ) p2 ON p1.price_id = p2.price_id AND p1.publish_time = p2.max_time
          ORDER BY p1.price_id
        `);
        res.json(result.rows);
      } catch (error) {
        logger.error('Error fetching prices', error);
        res.status(500).json({ error: 'Failed to fetch prices' });
      }
    });
    
    // Health check
    app.get('/health', (_, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });
    
    // Start the server
    app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });
    
    // Setup and start services
    await setupPythSubstreams();
    
    // Start the necessary services
    startPythDataIngestion();
    startPriceServices();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

bootstrap();