# CohortBridge

CohortBridge is a container-first monorepo with:
- `server/`: Express API + Postgres migrations
- `client/`: Svelte landing page
- `unit_tests/` and `API_tests/`: Jest + Supertest examples

## Prerequisites
- Docker + Docker Compose
- Bash/sh (for `run_tests.sh`)

## Environment setup
Copy the sample environment file:

```bash
cp .env.example .env
```

Optional services are controlled by env flags and Compose profiles:
- `ENABLE_MEILISEARCH=true` enables `meilisearch`
- `ENABLE_ADMINER=true` enables `adminer`

If enabled, run Compose with matching profiles:

```bash
COMPOSE_PROFILES="$( [ "${ENABLE_MEILISEARCH}" = "true" ] && printf "meilisearch" )$( [ "${ENABLE_MEILISEARCH}" = "true" ] && [ "${ENABLE_ADMINER}" = "true" ] && printf "," )$( [ "${ENABLE_ADMINER}" = "true" ] && printf "adminer" )" docker-compose up --build
```

Default (no optional services):

```bash
docker-compose up --build
```

## Run app

```bash
docker-compose up --build
```

Then verify:

```bash
curl http://localhost:4000/health
curl http://localhost:3000
```

## Run tests

```bash
./run_tests.sh
```

The script installs dependencies, ensures the database service is up, runs unit/API tests, and prints a final summary.

Frontend tests:

```bash
npm run test:frontend:component
npm run test:frontend:e2e
```

## Seed / migrations
Migrations run idempotently whenever `server` starts.

Manual migration run:

```bash
docker-compose run --rm server npm run migrate
```

Seed sample data:

```bash
docker-compose run --rm server npm run seed
```

## Search Engine
- `SEARCH_ENGINE=postgres` uses Postgres full-text + trigram search.
- `SEARCH_ENGINE=meilisearch` uses Meilisearch with automatic fallback to Postgres if unavailable.

Reindex all question documents:

```bash
docker-compose run --rm server npm run reindex
```

Run representative benchmark queries:

```bash
docker-compose run --rm server npm run benchmark:search
```

## ETL
Run the cleanse pipeline ad-hoc:

```bash
docker-compose run --rm etl
```

If your Compose version requires explicit profile activation:

```bash
docker-compose --profile etl run --rm etl
```

Or:

```bash
npm run etl
```

ETL docs:
- `docs/etl.md`

## Admin APIs
- `GET /admin/users`, `POST /admin/users`, `PUT /admin/users`
- `POST /admin/users/:id/freeze`
- `POST /admin/privacy_requests/:id/approve`
- `POST /admin/exports` and `GET /admin/exports/download/:token`

Role model:
- `admin`: full access
- `faculty`/`mentor`: scoped admin console access (privacy review + scoped exports)

## Notes
- No secrets are committed; use `.env` locally.
- `.env.example` documents required environment variables.

## Frontend UI Note
- Global design tokens and utility classes are in [App.svelte](C:\Users\hp\Desktop\My projects\TASK-14\repo\client\src\App.svelte) under `:root` and global `.container/.card/.row/.muted/.visually-hidden`.
- Reusable micro UI pieces are in:
  - [Card.svelte](C:\Users\hp\Desktop\My projects\TASK-14\repo\client\src\components\Card.svelte)
  - [Chip.svelte](C:\Users\hp\Desktop\My projects\TASK-14\repo\client\src\components\Chip.svelte)
