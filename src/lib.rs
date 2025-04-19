mod pb;
mod types;

use pb::sf::substreams::sei::oracle::v1::SetOraclePrice;
use substreams::pb::eth::v2 as eth;
use substreams::prelude::*;
use substreams::store::{StoreSetProto};
use substreams_ethereum::pb::eth::v2::Block;
use substreams_ethereum::Event;
use hex;

// Standard Pyth PriceUpdate event signature
// keccak256("PriceUpdate(bytes32,int64,uint64,int32)")
const PRICE_UPDATE_EVENT: [u8; 32] = hex::decode("d06a6b7f4bdc70c1279a327c83d6d6a665f12ff7ed9a155c5b2882c5f732356c").unwrap();

#[substreams::handlers::map]
fn filtered_events(block: Block, params: String) -> Result<eth::TransactionTraces, substreams::errors::Error> {
    // Extract contract address from params
    let param_parts: Vec<&str> = params.split(":").collect();
    if param_parts.len() != 2 || param_parts[0] != "contracts" {
        return Err(substreams::errors::Error::Mapping("Invalid params format. Expected 'contracts:0x...'".to_string()));
    }
    
    let target_contract = param_parts[1].to_lowercase();
    
    let mut filtered_traces = eth::TransactionTraces {
        traces: Vec::new(),
    };
    
    for transaction in block.transactions() {
        if let Some(to) = &transaction.to {
            if to.eq(&target_contract) {
                if let Some(receipt) = &transaction.receipt {
                    // Check if this transaction has Pyth price update events
                    for log in &receipt.logs {
                        if log.topics.len() >= 1 && 
                           (log.topics[0] == PRICE_UPDATE_EVENT.to_vec() ||
                            log.address == target_contract) {
                            filtered_traces.traces.push(transaction.clone());
                            break;
                        }
                    }
                }
            }
        }
    }
    
    Ok(filtered_traces)
}

#[substreams::handlers::map]
fn map_set_oracle_prices(traces: eth::TransactionTraces, params: String) -> Result<Vec<SetOraclePrice>, substreams::errors::Error> {
    let mut prices = Vec::new();
    
    for trace in traces.traces {
        if let Some(receipt) = &trace.receipt {
            for log in &receipt.logs {
                if log.topics.len() >= 1 && log.topics[0] == PRICE_UPDATE_EVENT.to_vec() {
                    // Decode PriceUpdate event:
                    // PriceUpdate(bytes32 id, int64 price, uint64 conf, int32 expo)
                    
                    // Get price ID from the first topic
                    let price_id = hex::encode(&log.topics[1]);
                    
                    // Parse price data from the logs
                    // Assuming the log data contains: [price (int64), conf (uint64), expo (int32)]
                    let data = &log.data;
                    if data.len() >= 32 {
                        // This is a simplified decoder - real implementation should handle decoding properly
                        let price_bytes = &data[0..8];
                        let conf_bytes = &data[8..16];
                        let expo_bytes = &data[16..20];
                        
                        // Convert bytes to values (this is a simple example)
                        let price = i64::from_be_bytes([
                            price_bytes[0], price_bytes[1], price_bytes[2], price_bytes[3],
                            price_bytes[4], price_bytes[5], price_bytes[6], price_bytes[7],
                        ]) as f64;
                        
                        let conf = u64::from_be_bytes([
                            conf_bytes[0], conf_bytes[1], conf_bytes[2], conf_bytes[3],
                            conf_bytes[4], conf_bytes[5], conf_bytes[6], conf_bytes[7],
                        ]) as f64;
                        
                        let expo = i32::from_be_bytes([
                            expo_bytes[0], expo_bytes[1], expo_bytes[2], expo_bytes[3],
                        ]);
                        
                        prices.push(SetOraclePrice {
                            price_id,
                            price,
                            conf,
                            expo,
                            publish_time: trace.block.as_ref().unwrap().timestamp() as i64,
                        });
                    }
                }
            }
        }
    }
    
    Ok(prices)
}

#[substreams::handlers::store]
fn store_set_oracle_prices(prices: Vec<SetOraclePrice>, store: StoreSetProto<SetOraclePrice>) {
    for price in prices {
        let price_id = price.price_id.clone();
        store.set(0, format!("oracle_price:{price_id}"), &price);
    }
}