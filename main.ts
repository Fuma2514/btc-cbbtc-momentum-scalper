import { runBars, type BarsState, type SellInput } from './vendor/makefun-bars.ts';

/**
 * BTC-Race strategy v1: short-horizon momentum confirmation, time-based exit.
 *
 * Signal: buy only when the latest close is >0.40% above the close three
 * observed bars earlier. Execute at the next bar open (the protocol's
 * standard one-bar latency). Hold for 35 bars from the entry fill, then sell.
 * Long-only, one position, deterministic integer comparisons, no clock,
 * randomness, network, or external files.
 *
 * Replay notes: the harness opens with hello (capital, caps, fees, seed),
 * then sends one batch per minute carrying a 1-minute cbBTC bar and the
 * fills of the previous batch's orders. A buy order fills at the next
 * bar's open against the pool depth, paying 4 bps of fee, 2 bps of fixed
 * slippage and constant-product price impact. The sell decision lands
 * one bar before the hold ends so the exit fills at the next open.
 */
const LOOKBACK_BARS = 3;
const ENTRY_RETURN_BPS = 40n; // 0.40%
const HOLD_BARS_FROM_FILL = 35;
const EXIT_DECISION_OFFSET = HOLD_BARS_FROM_FILL - 1;
const MAX_SLIPPAGE_BPS = 1_000;
const SYMBOL = 'CBBTC';

const closes: bigint[] = [];
let entryFillSeq: number | null = null;
// Cache the minimum notional once; the harness fees never change mid-run.
let minNotional: bigint | null = null;

/**
 * The momentum test: true when the close three observed bars ago is a usable
 * price and the latest close beats it by more than ENTRY_RETURN_BPS in bps.
 * Pure integer math on the rolling window, so the entry is exactly as
 * deterministic as the inline comparison it replaces.
 */
function momentumConfirmed(series: bigint[]): boolean {
  if (series.length < LOOKBACK_BARS + 1) return false;
  const now = series[series.length - 1];
  const then = series[0];
  return then > 0n && now * 10_000n > then * (10_000n + ENTRY_RETURN_BPS);
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((item) => item.symbol === SYMBOL);
    if (bar) {
      closes.push(BigInt(bar.c));
      // Keep only the values needed for the three-bar momentum test.
      if (closes.length > LOOKBACK_BARS + 1) closes.shift();
    }

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      // The first batch that sees the position is the batch whose open filled
      // the buy. A sell decision now fills at the next bar's open.
      if (entryFillSeq === null) entryFillSeq = batch.seq;
      if (batch.seq >= entryFillSeq + EXIT_DECISION_OFFSET) {
        const sell: SellInput = {
          side: 'sell',
          symbol: SYMBOL,
          qty: held.qty,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        };
        return [sell];
      }
      return [];
    }

    // A previously submitted sell has now filled (or the buy was rejected).
    entryFillSeq = null;

    if (!momentumConfirmed(closes)) return [];

    const weightRoom = state.weightRoom(SYMBOL);
    const spend = state.cash < weightRoom ? state.cash : weightRoom;
    if (minNotional === null) minNotional = BigInt(state.hello.fees.min_notional_quote_units);
    if (spend < minNotional || spend <= 0n) return [];

    return [{
      side: 'buy',
      symbol: SYMBOL,
      notional_quote_units: spend,
      max_slippage_bps: MAX_SLIPPAGE_BPS,
    }];
  },
});
