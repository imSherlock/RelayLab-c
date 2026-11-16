# Engineering review

## Implemented safeguards

Migrations run on one checked-out connection in a transaction with an advisory lock. Version and checksum mismatches fail closed. Failed DDL and ledger inserts roll back together. Uniqueness constraints enforce ingestion and attempt identity. Claims skip locked rows; completion checks token and unexpired lease, updating state and attempt telemetry atomically.

The API validates capability scope before event processing, bounds request bodies and parameterizes SQL. The dashboard renders event data with textContent. HMAC binds timestamp, event ID and raw body. Outbound delivery has a timeout and rejects redirects. Error responses and attempt records do not echo credentials or unbounded response bodies. HTTP drain and resource cleanup have separate bounded phases; Node receives container signals directly.

## Open findings

1. The Compose database bootstrap account is shared across services; runtime startup requires DDL. Separate migration ownership from least-privilege API, worker and receiver roles.
2. Attempts are counted on completion. Crashes after claim/send may leave no attempt record and are not bounded by five failed completions. Introduce a reviewed started/completed/unknown-attempt model.
3. Receipt deduplication does not make arbitrary external effects exactly once. Business writes require a transaction with their receipt or downstream idempotency.
4. Retention, credential-rotation drills, broad network-partition tests and resource/scaling measurements remain incomplete.
5. Migration checksums validate known history, not arbitrary schema drift. Index candidates require write-cost and varied-workload validation before rollout.

## Release decision

Suitable for local engineering evaluation only. Do not call this production-ready. Require revision-specific automated evidence and explicit deployment review before expanding its operational scope.
