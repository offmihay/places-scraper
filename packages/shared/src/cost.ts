/**
 * Cost per Google Places API (New) "Nearby Search" call, USD.
 * As of 2026-Q2 this is $0.032 in the Basic SKU. Override via
 * GOOGLE_PLACES_COST_PER_CALL_USD if Google changes pricing.
 */
export const DEFAULT_COST_PER_CALL_USD = 0.032;

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
