// src/models/token.ts
export interface Token {
  id: number;
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
  contract_address: string;
  created_at: Date;
  updated_at: Date;
}

export interface TokenPrice {
  token_id: number;
  price: string | null;
  conf?: string | null;
  expo?: number | null;
  publish_time: Date;
  source: string;
}

export interface TokenResponseDto {
  name: string;
  symbol: string;
  decimals: number;
  logo: string | null;
  contractAddress: string;
  currentPrice: string | null;
  priceUpdatedAt: string;
  last24hVariation: string | null;
  info: {
    sells: number;
    buys: number;
    bondedAt: string | null;
  };
}

export interface PageMetaDto {
  page: number;
  limit: number;
  totalItemsCount: number;
  pagesCount: number;
}

export interface TokenPageDto {
  data: TokenResponseDto[];
  meta: PageMetaDto;
}