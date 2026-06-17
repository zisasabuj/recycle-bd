// Bootstrap script: create the first SUPER_ADMIN
// Usage: node scripts/create-admin.js <username> <email> <password>
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth.js';

const prisma = new PrismaClient();

async function main() {
  const [,, username, email, password] = process.argv;
  if (!username || !email || !password) {
    console.error('Usage: node scripts/create-admin.js <username> <email> <password>');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters');
    process.exit(1);
  }

  // If any SUPER_ADMIN already exists, refuse
  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existing) {
    console.error(`❌ A SUPER_ADMIN already exists: ${existing.username} (${existing.email})`);
    console.error('   To promote a different user, log in as the existing super admin and use the API.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'SUPER_ADMIN', passwordHash },
    create: { username, email, passwordHash, role: 'SUPER_ADMIN', fullName: username }
  });

  console.log(`✅ Super admin ready: ${user.username} (${user.email}) — role: ${user.role}`);
  console.log('   Login at /login (or via API) to get a JWT.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
