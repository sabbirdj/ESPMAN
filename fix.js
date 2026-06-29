const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.device.updateMany({ where: { status: 'updating' }, data: { status: 'offline' } });
  console.log('Fixed stuck devices');
}
main();
