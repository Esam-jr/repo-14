# ETL Pipeline

The ETL container cleanses `questions` and `resources` into `cleaned_questions`.

## What It Does
- Deduplicates records using Postgres `pg_trgm` similarity on title/body.
- Normalizes tags (lowercase + synonym mapping).
- Infers `knowledge_points` using rule-based keyword heuristics.
- Writes cleaned records with `cleaned_at` timestamps.
- Writes audit trail events to `audit_logs`.

## Run Once (Ad-Hoc)

```bash
docker-compose run etl
```

Optional cleanup of run container:

```bash
docker-compose run --rm etl
```

If your Compose version enforces profiles for one-off runs, use:

```bash
docker-compose --profile etl run --rm etl
```

Equivalent npm script:

```bash
npm run etl
```

## Configuration
- `DATABASE_URL`: required DB connection string.
- `ETL_SIMILARITY_THRESHOLD`: optional similarity cutoff (default `0.78`).

Example:

```bash
ETL_SIMILARITY_THRESHOLD=0.82 docker-compose run --rm etl
```

## Scheduling
`etl/run_etl.sh` is the entrypoint script and can be used by cron/Kubernetes jobs:

```bash
sh /app/run_etl.sh
```

## Tests

```bash
npm run test:etl
```
