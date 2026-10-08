const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Sembrado de Datos con Horario Local Quito Ecuador (UTC-5) ---');

  const passwordHash = await bcrypt.hash('mvevip12345', 10);

  // 1. Usuarios
  const admin = await prisma.user.upsert({
    where: { email: 'admin@marketingvip.com' },
    update: {},
    create: {
      name: 'Adam Smith (Admin)',
      email: 'admin@marketingvip.com',
      passwordHash,
      role: 'ADMIN',
      phone: '+593991234567',
      avatarUrl: null
    }
  });

  const asesor1 = await prisma.user.upsert({
    where: { email: 'carlos.asesor@marketingvip.com' },
    update: {},
    create: {
      name: 'Carlos Mendoza',
      email: 'carlos.asesor@marketingvip.com',
      passwordHash,
      role: 'ASESOR',
      phone: '+593987654321',
      avatarUrl: null
    }
  });

  // Limpiar recordatorios previos de prueba
  await prisma.reminderFollowup.deleteMany();
  await prisma.reminderTag.deleteMany();
  await prisma.reminder.deleteMany();

  // 2. Etiquetas
  const tagCobro = await prisma.tag.upsert({
    where: { name: 'Confirmar Pago' },
    update: {},
    create: { name: 'Confirmar Pago', colorHex: '#10B981' }
  });

  const tagDemo = await prisma.tag.upsert({
    where: { name: 'Agendar Demo' },
    update: {},
    create: { name: 'Agendar Demo', colorHex: '#6366F1' }
  });

  // Fecha de Hoy en horario laboral de Quito (ej. 9:00 AM y 11:30 AM)
  const today = new Date();
  
  // Lead 1: Hoy a las 9:00 AM
  const rem1Date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0, 0);

  // Lead 2: Hoy a las 11:30 AM
  const rem2Date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 30, 0);

  // Lead 3: Hoy a las 3:00 PM (15:00)
  const rem3Date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0, 0);

  await prisma.reminder.create({
    data: {
      creatorId: admin.id,
      assignedId: admin.id, // Asignado a admin para que lo vea directamente
      clientName: 'Nikita Car Rental',
      clientPhone: '+593982233441',
      title: 'Call Nikita About Buying A Car',
      description: 'Prospecto solicitó llamada para revisar plan VIP automotriz y facilidades de pago.',
      scheduledAt: rem1Date,
      priority: 'HIGH',
      status: 'PENDING',
      sourceType: 'BOT_TEXT',
      tags: { create: [{ tagId: tagCobro.id }] }
    }
  });

  await prisma.reminder.create({
    data: {
      creatorId: admin.id,
      assignedId: admin.id,
      clientName: 'Dra. Anna Morales',
      clientPhone: '+593991122334',
      title: 'Morning Training with Anna',
      description: 'Capacitación sobre el dashboard médico UI/UX y dudas de suscripción.',
      scheduledAt: rem2Date,
      priority: 'MEDIUM',
      status: 'PENDING',
      sourceType: 'BOT_VOICE',
      tags: { create: [{ tagId: tagDemo.id }] }
    }
  });

  await prisma.reminder.create({
    data: {
      creatorId: admin.id,
      assignedId: admin.id,
      clientName: 'Ing. Fernando Viteri',
      clientPhone: '+593998877665',
      title: 'Llamada de Cierre Corporativo VIP',
      description: 'Revisión final de presupuesto acordado por WhatsApp Chatrace.',
      scheduledAt: rem3Date,
      priority: 'URGENT',
      status: 'PENDING',
      sourceType: 'BOT_TEXT',
      tags: { create: [{ tagId: tagCobro.id }] }
    }
  });

  console.log('✅ Nuevos recordatorios generados para la fecha de hoy en horas laborales (9:00 AM, 11:30 AM y 3:00 PM).');
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
