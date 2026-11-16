# Query-plan experiment — 2026-11-16

Run `node --import tsx integration/query-plan.ts` with the test dependencies installed. It creates a disposable real PostgreSQL server on loopback port 55435. It captures the actual SQL emitted by PostgresStore.claim/list, runs EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), and rolls back each explained transaction. EXPLAIN ANALYZE executes the UPDATE; do not aim this experiment at a real database. The temporary cluster is removed after the experiment.

Dataset: 20,000 tiny synthetic rows, 19,900 delivered and 100 due pending, no active workers, Windows local PostgreSQL 18 fixture. One observation per query/variant after ANALYZE; no cold-cache control, random ordering, CPU/RSS sampling, percentile estimation or concurrency. These are query-plan observations, not throughput or production capacity.

| Query | Baseline execution ms | Candidate execution ms | Baseline shared hits | Candidate shared hits/reads |
|---|---:|---:|---:|---:|
| claim | 1.324 | 0.078 | 216 | 16 / 2 |
| latest 100 | 2.068 | 0.023 | 207 | 4 / 0 |

Baseline claim performed a sequential scan and filtered out 19,900 completed rows before sorting. A candidate partial index on next_at WHERE state IN ('pending','processing') changed this to an index scan. A separate full next_at DESC index removed the full scan/sort for listing recent rows. Both indexes existed only in this disposable experiment; no migration was added.

Next decision: benchmark insert/update cost, storage growth and distributions with many future pending events and unexpired processing leases, then validate under competing workers. A partial active-state index still scans ineligible active rows; it is not automatically optimal for every workload. If benefit persists, add a versioned index migration with an explicit locking/rollout strategy. Do not edit the historical baseline schema or migration checksums.

The script reproduces this synthetic diagnostic. Record a fresh run before relying on the numerical observations for any deployment decision.
