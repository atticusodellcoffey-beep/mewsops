# MewsOps

Mangrove Mews rescue operations prototype. Synthetic data only.

## Team assignments

See the [five-person implementation prompt pack](docs/team-prompts/README.md). Give each teammate the shared contract and their numbered assignment. These describe planned implementation, not completed functionality.

## Scope

MewsOps turns intentional volunteer reports, synthetic WhatsApp exports, photos, and locations into reviewable colony updates. AI organizes evidence; deterministic code owns state; staff approve sensitive changes.

## Setup

```sh
npm install
npm run typecheck
npm test
npm run dev
npm run demo
```

The backend walkthrough uses real local SQLite persistence and a deterministic proposal fixture. It does not call OpenAI or inspect images. No API key is required for these commands. `npm run dev` prints a backend summary; it does not start an HTTP server.

To explicitly reset the synthetic demo database, run `npm run demo-reset -- --confirm-demo-reset`. It refuses custom paths and unrecognized databases. The database lives at `storage/mewsops-demo.db` and is excluded from Git.

The API and agent lanes will add sessions, transport, uploads, and live inference. This project does not connect to or scrape WhatsApp and must not contain real rescue data. Local SQLite is not a durable Vercel Functions storage solution.

See [backend decisions](docs/backend-build-decisions.md) and [teammate handoff](docs/backend-handoff.md) for the integration boundaries.

The [verification report](docs/backend-verification.md) records the executed checks and remaining integration work.
