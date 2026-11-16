# Verification scope

Evidence must identify the source revision, environment and actual result. A configured check is not a passing check. Executed results are recorded below.

| Layer | Coverage |
|---|---|
| TypeScript | Source, component tests, integration fixtures and browser tests |
| Component/reference | Idempotency, signatures, fencing, retries, migrations/rollback, API capability policy and bounded shutdown |
| PostgreSQL | Independent claim processes, durable restart, stale completion rejection |
| HTTP E2E | Unauthorized/wrong-scope requests, quotas, duplicate ingestion, HMAC, retries, receipt replay, killed-worker lease recovery, live database restart and terminal dead state |
| Docker/Chromium | Complete stack, authenticated dashboard, outage display, coordinated restart and clean idle-service exit |
| Restore | Logical dump restored into a separate database; sorted rows compared across all four tables |

The restore comparison runs on the same temporary database server; it is not off-site disaster recovery or point-in-time recovery. Idle clean shutdown does not establish correctness under every in-flight failure. The receiver has no external business effect. Passing CI does not establish production security or capacity.

The optional soak and query-plan scripts are diagnostic tools, not unit tests. Run them explicitly and retain workload/environment details with results. No CPU/RSS or saturation claim is made.

Record new validation against this repository’s independent revision. Earlier repository history and workflow links are intentionally not imported.
