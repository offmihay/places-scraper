/**
 * Cost per Google Places API (New) "Nearby Search" call, USD.
 *
 * Our field mask includes `internationalPhoneNumber` and
 * `nationalPhoneNumber`, which puts every call into the
 * "Nearby Search Enterprise" SKU at $35 / 1,000 = $0.035 / call
 * (first 100,000 calls per month after the 1,000-call free cap;
 * volume tiers drop the marginal price above that — see README).
 *
 * Override via GOOGLE_PLACES_COST_PER_CALL_USD in .env when:
 *  - your monthly volume crosses 100k and you want tier-accurate estimates
 *  - you removed phone fields from the field mask (drops to Pro $0.032)
 *  - Google changes pricing
 */
export const DEFAULT_COST_PER_CALL_USD = 0.035;

/**
 * Multiplier we apply to the naive grid-cell count when estimating cost.
 * Quadtree split fires whenever a cell returns 20 (the API hard cap),
 * which is common in dense areas. 1.6 is conservative — actual ratios
 * we've seen on city-scale runs vary between 1.1 and 2.0.
 */
export const QUADTREE_INFLATION_FACTOR = 1.6;

export interface CostEstimate {
  baseCells: number;
  effectiveCalls: number;
  estimatedCostUsd: number;
}

export function estimateCost(
  baseCells: number,
  costPerCall: number = DEFAULT_COST_PER_CALL_USD,
  inflation: number = QUADTREE_INFLATION_FACTOR,
): CostEstimate {
  const effectiveCalls = Math.ceil(baseCells * inflation);
  return {
    baseCells,
    effectiveCalls,
    estimatedCostUsd: Number((effectiveCalls * costPerCall).toFixed(4)),
  };
}
