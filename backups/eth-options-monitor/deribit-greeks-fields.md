# Deribit Greeks Fields (from public/ticker and ticker subscription)

Source: https://docs.deribit.com/api-reference/market-data/public-ticker

## greeks object (options only)
- `delta` - Delta value
- `gamma` - Gamma value  
- `theta` - Theta value (time decay per day, in ETH for coin-margined)
- `vega` - Vega value (per 1% IV change, in ETH for coin-margined)
- `rho` - Rho value

## Other option-specific fields at top level
- `mark_iv` - Mark implied volatility (%)
- `bid_iv` - Implied volatility for best bid
- `ask_iv` - Implied volatility for best ask
- `underlying_price` - Underlying price for IV calculations
- `interest_rate` - Interest rate used in IV calculations
- `open_interest` - Total outstanding contracts
- `last_price` - Last trade price
