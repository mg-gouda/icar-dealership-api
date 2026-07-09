import { PrismaClient } from '@prisma/client';
import { encryptSecret } from '../src/common/utils/crypto.util';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { totpSecret: { not: null } },
    select: { id: true, totpSecret: true },
  });

  console.log(`Found ${users.length} users with TOTP secrets`);
  let migrated = 0;

  for (const user of users) {
    if (!user.totpSecret || user.totpSecret.includes(':')) continue; // already encrypted
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptSecret(user.totpSecret) },
    });
    migrated++;
  }

  console.log(`Migrated ${migrated} secrets`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
