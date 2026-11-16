# Paced local soak

Run `node --import tsx integration/soak.ts` after `npm ci`. Default duration is 300 seconds; `SOAK_SECONDS` accepts integers from 10 to 3600. It starts a disposable PostgreSQL instance on 55434, API on 4000 and receiver on 4001, with one worker. Reserve these loopback ports before running. On restricted Windows desktops, set TEMP/TMP to a writable workspace folder as described in migrations.md.

The workload sends a batch of ten distinct events each second, verifies HTTP 202 responses, samples the number of unfinished deliveries, then waits for all events to be delivered and checks receipt cardinality and failed attempt count. It prints ingest p50/p95/p99, elapsed time and maximum sampled pending count. Samples immediately after a burst can naturally show ten queued events. This is not a continuously measured backlog maximum.

The rate is paced, not a throughput saturation test. The elapsed time includes any slow batches and final drain; the nominal offered rate can exceed the achieved rate under contention. Ingest percentiles do not measure end-to-end delivery latency. No CPU/RSS sampling, failover, network partition or hostile destination is included. Five minutes at a small rate is preliminary sustained-load evidence, not a production soak or capacity guarantee.

Tests create their own credentials in memory and never print them. Cleanup terminates only spawned service processes, closes the test listener/pool, stops the disposable database and removes its newly created temporary directory. Do not point this fixture at an existing database.

The benchmark is manual and not run on every CI push. Core typecheck includes its source. Record results in verification.md together with revision and environment.
