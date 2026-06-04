# Price Spread Demo

Built to force a sensibly NON-ZERO retrospective report by giving the regions a
genuine inter-region price/carbon spread plus revenue on every workload.

## The spread

| region       | $/kWh | carbon g/kWh | grid_stress | role            |
|--------------|-------|--------------|-------------|-----------------|
| us-east-1    | 0.23  | 540          | medium      | expensive/dirty |
| us-central-1 | 0.12  | 250          | low         | mid             |
| us-west-2    | 0.06  | 95           | low         | cheap/clean     |
| eu-west-1    | 0.17  | 80           | medium      | compliance      |

`us-west-2` is ~4x cheaper and far cleaner than `us-east-1`, with large spare
capacity (256 GPUs), so moving a movable job there strictly lowers estimated
cost and carbon.

## What this fixture is designed to show

- **Movable jobs move.** The eight `train-prod-*`, `batch-*`, `finetune-*`, and
  `embed-*` jobs currently sit in the expensive `us-east-1`. They are non-critical,
  `can_move=true`, latency-insensitive, and allowed in `us-west-2`, so each gets a
  `move_region` recommendation to `us-west-2` with counted dollar savings.
- **Already-optimal stays.** `train-west-400` already runs in `us-west-2`; no move
  improves it, so it is `run_now`.
- **Latency-locked inference stays home.** `serve-api-100` (critical) and
  `serve-api-101` (high) set `max_latency_ms=25`. Only `us-east-1` (18 ms) clears
  that bar — `us-central-1` (35 ms) and `us-west-2` (72 ms) are latency-blocked — so
  they stay in `us-east-1` rather than chasing cheap power.
- **can_move=false pins.** `legacy-db-200` cannot move and is `pinned`.
- **Compliance/region-lock pins.** `eu-train-300` and `eu-serve-301` carry
  `data_residency_region=eu-west-1`; they are `pinned` to `eu-west-1` even though
  power there is pricier, demonstrating residency overriding the cost signal.

## Data quality

Every row populates `estimated_revenue_usd`, so the margin/profitability view is
exercised and the data-quality report no longer warns that revenue is 100% missing.

## Policy

Defaults that allow the profitable moves: 60-minute max delay, manual approval for
low-confidence moves, no blocked regions, no carbon ceiling, no global latency cap.
The cheap region is explicitly allowed.

Upload these files manually through the UI; the app does not auto-load fixtures.
