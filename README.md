# cbBTC momentum confirmation bot

Entry for make.fun [btc-race-24h-20261111-0801](https://make.fun/bounty/btc-race-24h-20261111-0801).

TypeScript (Node 22), standard library only. `vendor/makefun-bars.ts` is a byte-identical copy of the kit's SDK.

## Strategy
Short-horizon momentum confirmation on CBBTC 1-minute bars: buy (full weight room) only when the
latest close is > 0.40% above the close three observed bars earlier, fill at the next bar's open,
hold 35 bars from the entry fill, then sell. Long-only, one position, deterministic integer
comparisons, no wall clock, no randomness, no network.

## Dev-window result (kit dataset, `makefun grade-local`, driver process)
- net PnL: **+5.177725 USDC** on $1,000 (return +0.52%)
- 2 trades, win rate 1.0, max drawdown 0.42%, 0 rejected orders
- positive at 2x fees (+4.37)

## License
MIT
