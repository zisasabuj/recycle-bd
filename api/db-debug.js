// Debug endpoint — list actual columns of User table
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'User'
      ORDER BY ordinal_position;
    `);
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name;
    `);
    const userCount = await prisma.user.count();
    return res.status(200).json({
      userTableExists: cols.length > 0,
      userColumns: cols,
      allTables: tables,
      userCount,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
