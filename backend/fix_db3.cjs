const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
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
