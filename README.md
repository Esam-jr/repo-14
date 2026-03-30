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

## Seed / migrations
Migrations run idempotently whenever `server` starts.

Manual migration run:

```bash
docker-compose run --rm server npm run migrate
```

Seed sample data:

```bash
docker-compose exec db psql -U "${POSTGRES_USER:-cohortbridge}" -d "${POSTGRES_DB:-cohortbridge}" -c "INSERT INTO cohorts (name) VALUES ('Founding Cohort') ON CONFLICT DO NOTHING;"
```

## Notes
- No secrets are committed; use `.env` locally.
- `.env.example` documents required environment variables.
