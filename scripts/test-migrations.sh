#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local PostgreSQL database with a
# minimal Supabase auth/role shim, then runs the RLS assertions.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./scripts/test-migrations.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=asparc_migration_test
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d $DB -f tests/sql/supabase-shim.sql
for f in supabase/migrations/*.sql; do echo "→ $f"; psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"; done
OUT=$(psql -q -t -d $DB -f tests/sql/rls-test.sql 2>&1 || true)
echo "$OUT" | grep -E "OK|FAIL|ERROR" | sed -E 's/^ *(psql:[^ ]+ NOTICE: +)?//'
if echo "$OUT" | grep -qE "FAIL|ERROR"; then echo "✖ migration tests failed"; exit 1; fi
[ "$(echo "$OUT" | grep -c OK)" -ge 12 ] || { echo "✖ expected 12 checks"; exit 1; }
echo "✔ migrations + RLS verified"
