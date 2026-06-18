// Generate schema-matched SQL dump
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
  // Prisma.Decimal / BigInt-like objects: stringify plain
  if (typeof v === 'object') {
    if (typeof v.toFixed === 'function' || typeof v.toString === 'function') {
      const s = v.toString();
      // If looks like a number, return as-is (no quotes, no jsonb)
      if (/^-?\d+(\.\d+)?$/.test(s)) return s;
      return `'${s.replace(/'/g, "''")}'`;
    }
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
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

// Schema mappings: local field → Neon field
const SCHEMAS = {
  'User': {
    cols: ['id', 'email', 'phone', 'name', 'passwordHash', 'role', 'avatar', 'city', 'district', 'createdAt', 'updatedAt'],
    map: (r) => ({
      id: r.id, email: r.email, phone: r.phone, name: r.fullName || r.username,
      passwordHash: r.passwordHash, role: r.role, avatar: null, city: null, district: null,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    })
  },
  'Auction': {
    cols: ['id', 'sellerId', 'title', 'description', 'images', 'category', 'condition',
           'basePrice', 'currentMaxBid', 'bidIncrement', 'city', 'area', 'district', 'thana',
           'startsAt', 'endsAt', 'status', 'winnerId', 'viewCount', 'createdAt', 'updatedAt'],
    map: (r) => ({
      id: r.id, sellerId: r.sellerId, title: r.title, description: r.description,
      images: r.images || [], category: r.category, condition: r.condition,
      basePrice: r.basePrice, currentMaxBid: r.currentMaxBid, bidIncrement: r.bidIncrement,
      city: r.city, area: r.area, district: r.district, thana: r.thana,
      startsAt: r.startsAt || r.createdAt, endsAt: r.endsAt, status: r.status,
      winnerId: r.winnerId, viewCount: r.viewCount || 0,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    })
  },
  'Bid': {
    cols: ['id', 'auctionId', 'bidderId', 'amount', 'isWinning', 'createdAt'],
    map: (r) => ({
      id: r.id, auctionId: r.auctionId, bidderId: r.bidderId, amount: r.amount,
      isWinning: r.isWinning || false,
      createdAt: r.placedAt || r.createdAt,  // local: placedAt → Neon: createdAt
    })
  },
  'Watchlist': {
    cols: ['id', 'userId', 'auctionId', 'createdAt'],
    map: (r) => ({ id: r.id, userId: r.userId, auctionId: r.auctionId, createdAt: r.createdAt })
  },
  'SystemSetting': null,  // Not in Neon schema
};

(async () => {
  let sql = '';

  // Fetch in order
  for (const [model, schema] of Object.entries(SCHEMAS)) {
    if (!schema) {
      console.log(`${model}: skipped (no Neon table)`);
      continue;
    }
    const key = model[0].toLowerCase() + model.slice(1);
    const rows = await p[key].findMany();
    if (rows.length === 0) {
      console.log(`${model}: 0 rows (skipped)`);
      continue;
    }
    const mapped = rows.map(schema.map);
    sql += makeInsert(model, schema.cols, mapped) + '\n\n';
    console.log(`${model}: ${rows.length} rows`);
  }

  fs.writeFileSync('/tmp/dump.sql', sql);
  console.log(`\n✅ SQL written: /tmp/dump.sql (${sql.length} chars)`);
  console.log(sql.slice(0, 1000));

  await p.$disconnect();
})();
