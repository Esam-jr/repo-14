#!/usr/bin/env sh
set -eu

echo "[1/3] Installing workspace dependencies..."
npm install

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required for local tests (no Docker)."
  echo "Example: export DATABASE_URL=postgres://cohortbridge:cohortbridge@localhost:5432/cohortbridge"
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ]; then
  echo "JWT_SECRET is required for local tests (no Docker)."
  echo "Example: export JWT_SECRET=change-me-local-only"
  exit 1
fi

echo "[2/3] Running Jest suite against local Postgres..."
if npm test; then
  echo "[3/3] Final summary: PASS (all tests succeeded)"
  exit 0
else
  echo "[3/3] Final summary: FAIL (one or more tests failed)"
  exit 1
fi
