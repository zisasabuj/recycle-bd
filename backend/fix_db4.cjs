
const { Client } = require('pg');
const fs = require('fs');

async function main() {
  const encodedPass = fs.readFileSync('/tmp/.db_pass', 'utf8').trim();
  const connStr = `postgresql://neondb_owner:${encodedPass}@ep-polished-forest-adonhcpe.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require`;
  
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Neon DB');
    
    const result = await client.query("ALTER TABLE \"Auction\" ADD COLUMN IF NOT EXISTS \"listingType\" TEXT DEFAULT 'BID'");
    console.log('listingType column added:', result.command);
    
    const cols = await client.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'Auction' AND column_name = 'listingType'");
    console.log('Verification:', JSON.stringify(cols.rows));
    
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
}

main();
