# Schema upgrades and attempt telemetry

Services call `migrate(pool)` before serving or claiming work. Version 1 adopts the existing three-table development schema; version 2 adds nullable HTTP status, duration in milliseconds and a bounded error category to delivery attempts. Existing records remain intact with null telemetry, rather than invented measurements.

The runner checks out one connection, starts a transaction, obtains a transaction-scoped advisory lock, validates ordered history/checksums and applies pending SQL. Concurrent service startups serialize on the lock. A ten-second lock timeout prevents indefinite lock waiting. The DDL and ledger commit together; failures roll back the entire pending batch. A newer database or changed historical migration is rejected. Do not edit an applied migration; append a new version.

This adopts the known original schema, not an arbitrary database with incompatible tables. Inspect and back up any existing installation first. The current application still performs DDL on startup; a separate least-privilege migration role is future work.

## Recovery procedure

1. Stop API, worker and receiver; retain the database volume.
2. Back up with PostgreSQL `pg_dump` in custom format to a protected destination. Verify restoration into a separate disposable database before relying on a backup. CI includes a same-server logical restore comparison; off-site and point-in-time recovery remain outside that test.
3. Start the upgraded services against the intended database. Check `SELECT version,name,applied_at FROM schema_migrations ORDER BY version` and exercise ingest/delivery.
4. If migration fails, no part of the pending transaction should remain. Fix the cause and retry; do not manually insert ledger rows to bypass validation.
5. There are no destructive down migrations. For this additive version, the pre-migration code can use the old columns, but older migration-aware binaries reject a newer ledger. Prefer a forward correction. Restoring a backup can lose post-backup events and requires explicit operator planning.

Workers persist `http_status`, `duration_ms`, and one of `http_error`, `timeout`, `network_error`. They never store response bodies, URLs, exception strings or secrets in these fields. The existing fenced SQL statement records telemetry and completion atomically. Rejected stale completion records nothing. A process dying before completion still leaves no explicit attempt row; crash accounting is an open requirement.

API and receiver now stop accepting connections on SIGINT/SIGTERM, drain active HTTP requests, force-close remaining connections after five seconds, then end the pool. Component tests verify drain ordering and timeout behavior. CI checks idle container exit codes; in-flight signal stress requires separate verification; Windows process kill is not evidence of graceful POSIX signal handling.

## Windows test environment

The PostgreSQL helper uses UTF-8 with C locale and PostgreSQL's `pg_ctl` fast shutdown on Windows. The upstream helper used `taskkill`, which stalled in the tested sandbox. In restricted desktop environments, set TEMP and TMP to a writable workspace directory for the command: the sandbox system temporary directory rejected a PostgreSQL WAL rename. Do not use an existing user database for these tests.
