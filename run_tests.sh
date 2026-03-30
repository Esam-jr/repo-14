#!/usr/bin/env sh
set -eu

echo "[1/4] Installing workspace dependencies..."
npm install

echo "[2/4] Starting database service..."
docker-compose up -d db

echo "[3/4] Running tests..."
if DATABASE_URL="postgres://cohortbridge:cohortbridge@localhost:5432/cohortbridge" npm test; then
  echo "[4/4] Final summary: PASS (all tests succeeded)"
  docker-compose stop db >/dev/null 2>&1 || true
  exit 0
else
  echo "[4/4] Final summary: FAIL (one or more tests failed)"
  docker-compose stop db >/dev/null 2>&1 || true
  exit 1
fi
