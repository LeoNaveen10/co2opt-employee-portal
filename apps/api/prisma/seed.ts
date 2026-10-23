import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

type Invite = { email: string; name: string; role?: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; inviteToken: string };

function sha(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  const invites: Invite[] = JSON.parse(process.env.EMPLOYEE_INVITES || '[]');

  for (const invite of invites) {
    const email = invite.email.trim().toLowerCase();
    if (email.split('@')[1] !== 'co2opt.com') throw new Error(`Invalid email domain: ${email}`);
    if (!invite.inviteToken || invite.inviteToken.length < 24 || invite.inviteToken.startsWith('replace-')) {
      throw new Error(`Set a strong inviteToken for ${email}`);
    }
    await prisma.user.upsert({
      where: { email },
      update: {
        name: invite.name,
        role: invite.role ?? 'EMPLOYEE',
        active: true
      },
      create: {
        email,
        name: invite.name,
        role: invite.role ?? 'EMPLOYEE',
        inviteHash: sha(invite.inviteToken),
        active: true
      }
    });
  }

  console.log('Seed complete');
}

main().finally(async () => prisma.$disconnect());