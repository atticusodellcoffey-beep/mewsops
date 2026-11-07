# MewsOps

Mangrove Mews rescue operations prototype. Synthetic data only.

## Team assignments

See the [five-person implementation prompt pack](docs/team-prompts/README.md). Give each teammate the shared contract and their numbered assignment. These describe planned implementation, not completed functionality.

## Scope

MewsOps turns intentional volunteer reports, synthetic WhatsApp exports, photos, and locations into reviewable colony updates. AI organizes evidence; deterministic code owns state; staff approve sensitive changes.

## Setup

```sh
npm install
cp .env.example .env
npm run typecheck
npm run demo-reset
npm run dev
```

Live OpenAI mode is optional. Replay mode is the required fallback. This project does not connect to or scrape WhatsApp and must not contain real rescue data.
