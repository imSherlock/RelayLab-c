# Security review and boundaries

This is a local development lab. It is not approved for internet deployment.

Implemented controls: parameterized SQL; bounded 64 KiB HTTP bodies; bounded idempotency keys; raw-byte HMAC-SHA256 with timestamp and event ID binding; constant-time digest comparison; five-minute signature freshness; fixed operator-configured receiver URL (not client-selected); redirect rejection and request timeout; lease fencing; durable receiver receipt keyed by event ID and payload hash. Completion and delivery-attempt recording share one SQL statement.

The receiver demonstrates receipt persistence, not exactly-once execution of arbitrary external effects. Any business mutation must share the receipt transaction; downstream side effects need their own idempotency guarantees. Crashes before completion may cause redelivery. A killed attempt is not currently recorded as an explicit failed HTTP attempt.

Implemented: distinct read/write bearer capabilities, bounded fixed-window per-process limits, secret-file loading and negative access tests. See [access contract](access.md).

Remaining: least-privilege database roles; validate deployment configuration and outbound destination policy; broader database failover and partition testing; bounded retention; per-tenant isolation; secret rotation; explicit crash-attempt accounting; OS-signal shutdown verification; longer sustained load tests with resource and fault measurements. Bounded status/error/duration telemetry and component-tested HTTP draining are now implemented. Do not expose HOST=0.0.0.0 outside an isolated container network. Compose publishes API only to host loopback.

Dependency vulnerability status must be checked for the current lockfile; no audit proves complete security. Public source selection excludes .env, database data, logs and internal planning files. Development test secrets are non-production fixtures or generated at runtime.
