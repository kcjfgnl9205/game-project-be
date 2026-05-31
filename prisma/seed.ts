import { PrismaClient, AuthProvider, UserRole } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD ?? 'admin1234';
  const nickname = process.env.ADMIN_NICKNAME ?? 'admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== UserRole.ADMIN) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: UserRole.ADMIN },
      });
      console.log(`Promoted ${email} to ADMIN`);
    } else {
      console.log(`Admin ${email} already exists, skipping`);
    }
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      nickname,
      provider: AuthProvider.LOCAL,
      role: UserRole.ADMIN,
    },
  });
  console.log(`Created admin user: ${email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
