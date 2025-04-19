// src/types.ts
export interface TokenRow {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
  contract_address: string;
  created_at: string;
  updated_at: string;
}

export interface PriceRawRow {
  id?: number;
  price_id: string;
  price: number;
  conf: number;
  expo: number;
  publish_time: string;
  created_at?: string;
}

export interface Price5mRow {
  id?: number;
  token_id: number;
  price: number;
  source: string;
  timestamp?: string;
}