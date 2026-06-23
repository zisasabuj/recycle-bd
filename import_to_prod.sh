#!/bin/bash
set -e
cd /home/ubuntu/auction-platform

PROD_HOST="ep-polished-forest-adonhcpe.c-2.us-east-1.aws.neon.tech"
PROD_USER="neondb_owner"
PROD_PASS="npg_SDRQHAh30jnB"
PROD_DB="neondb"
DUMP_FILE="/home/ubuntu/auction-platform/dump.sql"

echo "==> Step 1: Dump local DB to project dir..."
docker exec auction_postgres pg_dump -U auction auction_db --data-only --no-owner --no-acl > "$DUMP_FILE" 2>err.log
echo "   Dump file: $DUMP_FILE"
ls -la "$DUMP_FILE"
echo "   First 3 lines:"
head -3 "$DUMP_FILE"
echo "   Error log (if any):"
cat err.log

echo ""
echo "==> Step 2: Wipe prod DB tables..."
PGPASSWORD="$PROD_PASS" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" \
  -c "BEGIN; TRUNCATE TABLE \"Bid\", \"Auction\", \"User\" CASCADE; COMMIT;"

echo ""
echo "==> Step 3: Import local dump to prod..."
PGPASSWORD="$PROD_PASS" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" \
  -f "$DUMP_FILE" -v ON_ERROR_STOP=0 2>import.log
echo "   Import errors (last 20):"
tail -20 import.log

echo ""
echo "==> Step 4: Verify prod DB..."
PGPASSWORD="$PROD_PASS" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" \
  -c 'SELECT username, email, role FROM "User";'
PGPASSWORD="$PROD_PASS" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" \
  -c 'SELECT COUNT(*) AS auctions FROM "Auction";'
PGPASSWORD="$PROD_PASS" psql -h "$PROD_HOST" -U "$PROD_USER" -d "$PROD_DB" \
  -c 'SELECT COUNT(*) AS bids FROM "Bid";'

echo ""
echo "==> DONE!"

