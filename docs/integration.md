# Running the HTTP demo

From the repository root, with a supported Node runtime (verified on Node 24):

```sh
npm ci
npm ci --prefix src/api
MEWSOPS_DEMO=1 npx tsx src/app.ts
```

In PowerShell set `$env:MEWSOPS_DEMO='1'` before `npx tsx src/app.ts`. The server binds 127.0.0.1:3000, migrates and seeds the local demo database, and uses the synthetic fixture. Open /api/health first. See [the HTTP contract](api-contract.md) for the phone-to-staff walkthrough. The root dev script still runs the backend CLI.

## Integration interfaces

- `src/contracts/index.ts` exports ReportInputSchema, AgentProposalSchema, DecisionInputSchema, ReportStatusSchema, ReviewSchema, Envelope and shared domain input types. Report and proposal validation delegates to the backend's strict parsers. Coordinate changes to those parsers with the services owner.
- `createApiServer({db,uploadDir,analyzeReport,verifiedSubject,timeoutMs,demo})` returns a Node HTTP server. Supply a migrated database and private storage directory. The optional verifiedSubject adapter must verify the session and return only the authenticated userId. The server reloads roles and assignments per request. Demo sessions are in memory, expire in one hour and reset on restart. Enable persona switching only in an isolated local synthetic demo.
- `AnalyzeReport` in src/api/processing.ts accepts a scoped report (id, text, colonyId, mediaIds) and AbortSignal. Return unknown for strict schema and evidence validation. Wire the agent owner's runtime through this function; its trusted context provider must restrict image and candidate access to the report. The only public process command takes an empty body. Staff decisions remain separate. Inject API keys server-side; request bodies, cookies, filenames and agent exceptions are not logged.
- The backend creates an immediate unverified alert and uses transaction receipts to deduplicate proposals and approvals. One process coalesces competing work by rejecting concurrent attempts. A crash before applying a proposal leaves the saved report retryable. An analyzer that misses the deadline cannot apply a late result. Backends handling multiple instances should coordinate processing leases and budgets.
- Exact input bytes determine the private storage key. Sharp decodes, auto-orients and re-encodes sanitized PNGs; filenames, original metadata and raw uploads are discarded. Each upload has a separate ownership record. A shared file hash does not link a cat. Seed-only media references return 503 until a real synthetic upload is supplied.
- The API-local npm manifest pins Sharp to keep dependency changes inside this lane. The coordinator may consolidate the manifest/lockfile into the root install. Broaden the root ignore policy to cover .env.\* (preserving intentional empty example templates) before using live keys.

## Verification and deployment

Run `npm run typecheck`, `npx vitest run tests/api` and `npm test`. The HTTP suite uses temporary real SQLite databases, synthetic JPEG/PNG handling and loopback cookies. Live inference requires a separate agent integration check. The current deployment target is local only. Before hosting on Vercel, replace filesystem SQLite and uploads with durable external transactional storage and private object storage, provide verified production sessions, disable demo switching, and test persistence and private access across redeploys. No provider is provisioned by this lane.

Verification on Windows with Node 24.22.1: typecheck passed and all four API tests passed. The complete suite passed 41 of 42 tests. The existing database reset test stopped at symlinkSync with EPERM because the Windows account lacks symlink privileges. Rerun that case on a symlink-capable runner. Reusable frontend inputs are exported as demoReport and demoDecision from src/contracts/fixtures.ts.
