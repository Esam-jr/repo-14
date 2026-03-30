#!/usr/bin/env sh
set -eu

echo "[ETL] Starting cleanse pipeline..."
node /app/cleanse.js
echo "[ETL] Completed."
