const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://neondb_owner:nKl2025%21%40%23%24@ep-polished-forest-adonhcpe.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
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
