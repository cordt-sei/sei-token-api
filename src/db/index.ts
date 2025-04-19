// src/db/index.ts
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

interface TokenRow {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
  contract_address: string;
  created_at: string;
  updated_at: string;
}

interface PriceRawRow {
  id: number;
  price_id: string;
  price: number;
  conf: number;
  expo: number;
  publish_time: string;
  created_at: string;
}

interface Price5mRow {
  id: number;
  token_id: number;
  price: number;
  source: string;
  timestamp: string;
}

interface QueryResult<T> {
  rows: T[];
  rowCount?: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../database.sqlite');

// Initialize the database
const db = new Database(dbPath, { verbose: msg => logger.debug(msg) });

// Create tables if they don't exist
function initDatabase() {
  // Create prices_raw table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prices_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_id TEXT NOT NULL,
      price NUMERIC,
      conf NUMERIC,
      expo INTEGER,
      publish_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimals INTEGER NOT NULL,
      logo TEXT,
      contract_address TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create prices_5m table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prices_5m (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER,
      price NUMERIC,
      source TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (token_id) REFERENCES tokens (id)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prices_raw_price_id ON prices_raw(price_id);
    CREATE INDEX IF NOT EXISTS idx_prices_raw_publish_time ON prices_raw(publish_time);
    CREATE INDEX IF NOT EXISTS idx_prices_5m_token_id ON prices_5m(token_id);
    CREATE INDEX IF NOT EXISTS idx_prices_5m_timestamp ON prices_5m(timestamp);
  `);

  // Add sample tokens if none exist
  const tokenCount = db.prepare('SELECT COUNT(*) as count FROM tokens').get() as { count: number };
  if (tokenCount.count === 0) {
    const insertToken = db.prepare(`
      INSERT INTO tokens (name, symbol, decimals, contract_address)
      VALUES (?, ?, ?, ?)
    `);

    insertToken.run('Sei', 'SEI', 18, '0x0000000000000000000000000000000000000000');
    insertToken.run('Ethereum', 'ETH', 18, '0x0000000000000000000000000000000000000001');
    insertToken.run('Bitcoin', 'BTC', 8, '0x0000000000000000000000000000000000000002');

    logger.info('Sample tokens created');
  }

  logger.info('Database initialized successfully');
}

// Initialize the database
initDatabase();

// Prepare statements for common queries
const insertPriceRaw = db.prepare(`
  INSERT INTO prices_raw (price_id, price, conf, expo, publish_time)
  VALUES (?, ?, ?, ?, ?)
`);

const insertPrice5m = db.prepare(`
  INSERT INTO prices_5m (token_id, price, source)
  VALUES (?, ?, ?)
`);

// Create a query interface compatible with the existing code
const query = <T>(text: string, params: any[] = []): QueryResult<T> => {
  try {
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      if (text.includes('DISTINCT ON')) {
        // Handle the PostgreSQL-specific DISTINCT ON clause
        // For SQLite, we'll use a different approach with GROUP BY
        const modifiedText = text
          .replace(/SELECT DISTINCT ON \([^)]+\)/i, 'SELECT')
          .replace(/ORDER BY [^,]+, publish_time DESC/i, 'GROUP BY price_id');
        
        const stmt = db.prepare(modifiedText);
        const rows = stmt.all(...params) as T[];
        return { rows };
      } else {
        const stmt = db.prepare(text);
        const rows = stmt.all(...params) as T[];
        return { rows };
      }
    } else if (text.trim().toUpperCase().startsWith('INSERT')) {
      if (text.includes('prices_raw')) {
        const result = insertPriceRaw.run(params[0], params[1], params[2], params[3], params[4]);
        return { rows: [], rowCount: result.changes };
      } else if (text.includes('prices_5m')) {
        const result = insertPrice5m.run(params[0], params[1], params[2]);
        return { rows: [], rowCount: result.changes };
      } else {
        const stmt = db.prepare(text);
        const result = stmt.run(...params);
        return { rows: [], rowCount: result.changes };
      }
    } else {
      const stmt = db.prepare(text);
      const result = stmt.run(...params);
      return { rows: [], rowCount: result.changes };
    }
  } catch (error) {
    logger.error('Error executing query', error);
    throw error;
  }
};

export default {
  query,
  db,
  init: () => Promise.resolve() // No-op for compatibility
};