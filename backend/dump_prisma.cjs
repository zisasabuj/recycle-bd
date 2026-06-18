const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const TABLES = [
  { model: 'user', name: 'users' },
  { model: 'auction', name: 'auctions' },
  { model: 'bid', name: 'bids' },
  { model: 'watchlist', name: 'watchlist' },
  { model: 'chatMessage', name: 'chat_messages' },
  { model: 'systemSetting', name: 'system_settings' },
  { model: 'notification', name: 'notifications' },
  { model: 'chat', name: 'chats' },
  { model: 'transaction', name: 'transactions' },
];

(async () => {
  const p = new PrismaClient({
    log: ['error', 'warn'],
  });
  const dump = {};
  let total = 0;

  try {
    await p.$connect();
    console.log('Connected. DB URL: ' + (process.env.DATABASE_URL || 'from .env'));
    const userCount = await p.user.count();
    console.log('users in DB:', userCount);
    for (const { model, name } of TABLES) {
      try {
        const rows = await p[model].findMany();
        dump[name] = rows;
        total += rows.length;
        console.log(`  ${name}: ${rows.length} rows`);
      } catch (e) {
        console.log(`  ${name}: skip [${e.code || ''}] ${e.message.split('\n')[0]}`);
      }
    }

    fs.writeFileSync('/tmp/db_dump.json', JSON.stringify(dump, (k, v) => {
      if (v instanceof Date) return v.toISOString();
      return v;
    }, 2));

    console.log(`\n✅ Saved /tmp/db_dump.json (${total} rows, ${fs.statSync('/tmp/db_dump.json').size} bytes)`);
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();
