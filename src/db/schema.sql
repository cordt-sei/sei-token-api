-- db/schema.sql
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Tokens table for storing token metadata
CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(255) NOT NULL,
    decimals INTEGER NOT NULL,
    logo VARCHAR(512),
    contract_address VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Raw price data from Pyth oracle
CREATE TABLE IF NOT EXISTS prices_raw (
    id SERIAL PRIMARY KEY,
    price_id VARCHAR(255) NOT NULL,
    price NUMERIC(78, 18),
    conf NUMERIC(78, 18),
    expo INTEGER,
    publish_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5-minute price snapshots
CREATE TABLE IF NOT EXISTS prices_5m (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(id),
    price NUMERIC(78, 18),
    source VARCHAR(50) NOT NULL, -- 'oracle', 'pool', 'pyth', etc.
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create a hypertable for time-series data
SELECT create_hypertable('prices_5m', 'timestamp');

-- 24-hour price aggregates
CREATE TABLE IF NOT EXISTS prices_24h (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(id),
    open_price NUMERIC(78, 18),
    high_price NUMERIC(78, 18),
    low_price NUMERIC(78, 18),
    close_price NUMERIC(78, 18),
    price_date DATE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tracking trade activity
CREATE TABLE IF NOT EXISTS token_trades (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(id),
    is_buy BOOLEAN NOT NULL,
    amount NUMERIC(78, 18),
    price NUMERIC(78, 18),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create a hypertable for time-series data
SELECT create_hypertable('token_trades', 'timestamp');

-- Table for bonded tokens
CREATE TABLE IF NOT EXISTS bonded_tokens (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(id),
    bonded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tracking new tokens
CREATE TABLE IF NOT EXISTS new_tokens_raw (
    id SERIAL PRIMARY KEY,
    chain_type VARCHAR(50) NOT NULL, -- 'evm', 'cosmwasm'
    contract_address VARCHAR(255) UNIQUE NOT NULL,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_prices_5m_token_id ON prices_5m(token_id);
CREATE INDEX IF NOT EXISTS idx_prices_5m_timestamp ON prices_5m(timestamp);
CREATE INDEX IF NOT EXISTS idx_prices_24h_token_id ON prices_24h(token_id);
CREATE INDEX IF NOT EXISTS idx_token_trades_token_id ON token_trades(token_id);
CREATE INDEX IF NOT EXISTS idx_token_trades_timestamp ON token_trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_prices_raw_price_id ON prices_raw(price_id);
CREATE INDEX IF NOT EXISTS idx_prices_raw_publish_time ON prices_raw(publish_time);