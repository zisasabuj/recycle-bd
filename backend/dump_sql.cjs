// Generate SQL INSERT dump from local Prisma + POST to Vercel
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const p = new PrismaClient();

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) return `ARRAY[${v.map(esc).join(',')}]::text[]`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function makeInsert(table, cols, rows) {
  if (rows.length === 0) return '';
  const values = rows.map(r => {
    const ordered = cols.map(c => esc(r[c]));
    return `(${ordered.join(',')})`;
  }).join(',\n  ');
  return `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES\n  ${values} ON CONFLICT (id) DO NOTHING;`;
}

(async () => {
  // Fetch in FK order
  const data = {};
  const order = [
    ['user', 'users'],
    ['auction', 'auctions'],
    ['bid', 'bids'],
    ['watchlist', 'watchlist'],
    ['chatMessage', 'chat_messages'],
    ['systemSetting', 'system_settings'],
    ['notification', 'notifications'],
    ['chat', 'chats'],
    ['transaction', 'transactions'],
  ];

  for (const [model, name] of order) {
    try {
      data[name] = await p[model].findMany();
      console.log(`${name}: ${data[name].length} rows`);
    } catch (e) {
      console.log(`${name}: 0 (${e.message.split('\n')[0]})`);
      data[name] = [];
    }
  }

  // Build SQL
  let sql = `-- Dump generated ${new Date().toISOString()}\n`;
  sql += `-- ${data.users.length} users, ${data.auctions.length} auctions, ${data.bids.length} bids\n\n`;

  if (data.users.length) {
    sql += makeInsert('users', Object.keys(data.users[0]), data.users) + '\n\n';
  }
  if (data.auctions.length) {
    sql += makeInsert('auctions', Object.keys(data.auctions[0]), data.auctions) + '\n\n';
  }
  if (data.bids.length) {
    sql += makeInsert('bids', Object.keys(data.bids[0]), data.bids) + '\n\n';
  }
  if (data.watchlist.length) {
    sql += makeInsert('watchlist', Object.keys(data.watchlist[0]), data.watchlist) + '\n\n';
  }
  if (data.chat_messages.length) {
    sql += makeInsert('chat_messages', Object.keys(data.chat_messages[0]), data.chat_messages) + '\n\n';
  }
  if (data.system_settings.length) {
    sql += makeInsert('system_settings', Object.keys(data.system_settings[0]), data.system_settings) + '\n\n';
  }
  if (data.notifications.length) {
    sql += makeInsert('notifications', Object.keys(data.notifications[0]), data.notifications) + '\n\n';
  }

  fs.writeFileSync('/tmp/dump.sql', sql);
  console.log(`\n✅ SQL dump: /tmp/dump.sql (${sql.length} chars)`);
  console.log(`   First 500 chars:\n${sql.slice(0, 500)}`);

  await p.$disconnect();
})();
