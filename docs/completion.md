# Readiness criteria

A criterion is satisfied only with observed evidence tied to the source revision.

- Typecheck and component tests pass.
- Real PostgreSQL constraints, concurrent claims, restart durability and stale fencing pass.
- HTTP ingestion, capability rejection, quotas, retries, recovery and terminal dead-state tests pass.
- Docker build, Chromium dashboard and restart persistence pass.
- Container shutdown and logical restore comparisons pass within their documented test scope.
- Security limitations and local-only bindings are explicit.
- Before broader deployment: separate least-privilege database roles, explicit crashed-attempt accounting, retention and rotation validation, resource/scaling measurements, broader fault recovery and an approved deployment plan.

There is no automatic dead-letter redrive or stable production release. Re-evaluate these criteria after substantive changes.
