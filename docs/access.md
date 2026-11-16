# Local capability access

This is a loopback development lab, not an internet-facing identity service. API tokens are shared service capabilities, not user accounts or tenant isolation.

## PowerShell and Docker

Install Node 24 and Docker Desktop. In the checkout, generate credentials locally (never paste them into chat or commit them):

```powershell
$env:POSTGRES_PASSWORD = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
$env:RELAY_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:API_READ_TOKEN = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:API_WRITE_TOKEN = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up --build -d --wait
$headers = @{ Authorization = "Bearer $env:API_WRITE_TOKEN"; 'Idempotency-Key' = 'order-42' }
Invoke-RestMethod http://127.0.0.1:4000/events -Method Post -Headers $headers -ContentType application/json -Body '{"type":"order.paid","orderId":42}'
Invoke-RestMethod http://127.0.0.1:4000/events -Headers @{ Authorization = "Bearer $env:API_READ_TOKEN" }
```

Open http://127.0.0.1:4000 and enter the read token. For a local clipboard, `$env:API_READ_TOKEN | Set-Clipboard`; clear the clipboard after pasting. Disconnect/reload clears the dashboard credential. It is never stored in localStorage or a URL. Stop with `docker compose stop`; do not use `down -v` if you want to preserve the database. Reuse the original database password for an existing volume; changing the environment does not rotate an initialized PostgreSQL role password.

For native development, provide DATABASE_URL for your local PostgreSQL and run the API, receiver and worker in separate terminals. Each terminal needs its relevant credentials. `npm ci`, `npm run typecheck`, `npm test`, `npm run test:integration`, and `npm run test:e2e` validate the lab; test suites create their own random credentials.

## Contract

- POST /events: write credential; GET /events: read credential. A valid credential with the wrong scope gets 403; missing/invalid gets 401; exhausted quota gets 429 with Retry-After. Errors do not echo credentials.
- GET / and GET /healthz are public, expose no event data. Health performs SELECT 1. This is not comprehensive DoS protection.
- API_RATE_LIMIT defaults to 120 requests/minute per capability, including denied scope requests. Anonymous requests share a maximum 30/minute bucket. Exactly three buckets bound memory. Fixed windows permit boundary bursts. Limits reset on restart and are per API process, not cluster-wide. A shared token shares its quota. Test load explicitly raises the quota to 10000.
- API_READ_TOKEN, API_WRITE_TOKEN, RELAY_SECRET support an alternative NAME_FILE UTF-8 mounted file; setting both fails startup. Minimum 32 non-whitespace characters is validation, not proof of entropy. Generate random values. Compose currently passes environment credentials; host/container administrators can inspect them. Mounted secret files are a supported native option, not a managed secret vault.
- To rotate API tokens: stop API, replace with fresh distinct values and restart, then update callers. There is no overlap period. Rotate HMAC with worker and receiver stopped together, use the same new secret, restart receiver then worker. Pending events remain durable. Database role rotation is a separate administrative procedure, not implemented here.
- No TLS or public deployment. Receiver HMAC authenticates the sender but does not encrypt payloads. Keep all host bindings on loopback. Never commit .env or credential files.

## Remaining security gates

Separate least-privilege runtime database roles from migration/owner roles; the current Compose bootstrap account is overprivileged. Add multi-user identity/tenant isolation only if that becomes an explicit product requirement. Verify credential rotation and revocation under load. Audit dependency provenance and secret scanning before any release.
