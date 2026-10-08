const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { sendPushToUser } = require('../services/webPushService');

/**
 * Obtener recordatorios
 * - Asesor: Solo sus recordatorios
 * - Admin: Todos o filtrados por asesor
 */
const getReminders = async (req, res) => {
  try {
    const { status, date, assignedId, assignedIds, search } = req.query;
    const where = {};

    if (req.user.role === 'ADMIN') {
      if (assignedIds) {
        const idList = String(assignedIds).split(',').map(s => s.trim()).filter(Boolean);
        if (idList.length > 0) {
          where.assignedId = { in: idList };
        }
      } else if (assignedId) {
        if (assignedId.includes(',')) {
          const idList = assignedId.split(',').map(s => s.trim()).filter(Boolean);
          where.assignedId = { in: idList };
        } else {
          where.assignedId = assignedId;
        }
      }
    } else {
      where.assignedId = req.user.id;
    }

    if (status) {
      where.status = status;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      where.scheduledAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    if (search) {
      where.OR = [
        { clientName: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: {
        assigned: { select: { id: true, name: true, avatarUrl: true, role: true } },
        creator: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        followups: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { scheduledAt: 'asc' }
    });

    return res.json(reminders);
  } catch (error) {
    console.error('Error obteniendo recordatorios:', error);
    return res.status(500).json({ error: 'Error al obtener recordatorios' });
  }
};

/**
 * Crear recordatorio
 */
const createReminder = async (req, res) => {
  try {
    const {
      clientName,
      clientPhone,
      title,
      description,
      scheduledAt,
      priority = 'MEDIUM',
      assignedId,
      sourceType = 'MANUAL',
      tags = []
    } = req.body;

    if (!clientName || !title || !scheduledAt) {
      return res.status(400).json({ error: 'Nombre de cliente, título y fecha programada son obligatorios' });
    }

    const finalAssignedId = req.user.role === 'ADMIN' && assignedId ? assignedId : req.user.id;

    const reminder = await prisma.reminder.create({
      data: {
        creatorId: req.user.id,
        assignedId: finalAssignedId,
        clientName,
        clientPhone,
        title,
        description,
        scheduledAt: new Date(scheduledAt),
        priority,
        sourceType,
        tags: {
          create: tags.map((tagId) => ({ tagId }))
        }
      },
      include: {
        assigned: true,
        tags: { include: { tag: true } }
      }
    });

    if (finalAssignedId !== req.user.id) {
      sendPushToUser(finalAssignedId, {
        title: `Nuevo Recordatorio Asignado`,
        body: `${req.user.name} te ha asignado el lead: ${clientName}`,
        url: `/#/reminders/${reminder.id}`
      });
    }

    return res.status(201).json(reminder);
  } catch (error) {
    console.error('Error creando recordatorio:', error);
    return res.status(500).json({ error: 'Error al crear recordatorio' });
  }
};

/**
 * Obtener detalle de un recordatorio con bitácora
 */
const getReminderById = async (req, res) => {
  try {
    const { id } = req.params;
    const reminder = await prisma.reminder.findUnique({
      where: { id },
      include: {
        assigned: { select: { id: true, name: true, avatarUrl: true } },
        creator: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        followups: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!reminder) {
      return res.status(404).json({ error: 'Recordatorio no encontrado' });
    }

    if (req.user.role !== 'ADMIN' && reminder.assignedId !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este recordatorio' });
    }

    return res.json(reminder);
  } catch (error) {
    console.error('Error obteniendo recordatorio:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
};

/**
 * Marcar como completado
 */
const completeReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    if (req.user.role !== 'ADMIN' && reminder.assignedId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });

    await prisma.reminderFollowup.create({
      data: {
        reminderId: id,
        userId: req.user.id,
        note: note ? `Completado: ${note}` : 'Marcado como completado',
        actionType: 'STATUS_CHANGE'
      }
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error al completar recordatorio:', error);
    return res.status(500).json({ error: 'Error al completar' });
  }
};

/**
 * Reactivar / Reprogramar a Pendiente (con nueva fecha/hora y observación)
 */
const reopenReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const { newScheduledAt, note } = req.body;

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    if (req.user.role !== 'ADMIN' && reminder.assignedId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const updateData = {
      status: 'PENDING',
      notificationSent: false
    };

    if (newScheduledAt) {
      updateData.scheduledAt = new Date(newScheduledAt);
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: updateData
    });

    const followupText = newScheduledAt
      ? `Reagendado para ${new Date(newScheduledAt).toLocaleString('es-EC')}. ${note ? `Nota: ${note}` : ''}`
      : `Reactivado a Pendiente. ${note ? `Nota: ${note}` : ''}`;

    await prisma.reminderFollowup.create({
      data: {
        reminderId: id,
        userId: req.user.id,
        note: followupText,
        actionType: newScheduledAt ? 'RESCHEDULE' : 'STATUS_CHANGE'
      }
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error reactivando/reprogramando recordatorio:', error);
    return res.status(500).json({ error: 'Error al reactivar recordatorio' });
  }
};

/**
 * Dar de baja con observación obligatoria
 */
const dismissReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const { dismissReason } = req.body;

    if (!dismissReason || dismissReason.trim() === '') {
      return res.status(400).json({ error: 'La observación/motivo de baja es estrictamente obligatoria' });
    }

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    if (req.user.role !== 'ADMIN' && reminder.assignedId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        status: 'DISMISSED',
        dismissReason
      }
    });

    await prisma.reminderFollowup.create({
      data: {
        reminderId: id,
        userId: req.user.id,
        note: `Dado de baja por: ${dismissReason}`,
        actionType: 'STATUS_CHANGE'
      }
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error al dar de baja:', error);
    return res.status(500).json({ error: 'Error al procesar baja' });
  }
};

/**
 * Transferir / Reasignar recordatorio
 */
const transferReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const { newAssignedId, note } = req.body;

    if (!newAssignedId) {
      return res.status(400).json({ error: 'Debe especificar el usuario de destino' });
    }

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    if (req.user.role !== 'ADMIN' && reminder.assignedId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para transferir este recordatorio' });
    }

    const newAssignedUser = await prisma.user.findUnique({ where: { id: newAssignedId } });
    if (!newAssignedUser) {
      return res.status(404).json({ error: 'Usuario destinatario no encontrado' });
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        assignedId: newAssignedId,
        status: 'PENDING',
        notificationSent: false
      }
    });

    await prisma.reminderFollowup.create({
      data: {
        reminderId: id,
        userId: req.user.id,
        note: `Transferido a ${newAssignedUser.name}. ${note ? `Nota: ${note}` : ''}`,
        actionType: 'TRANSFER'
      }
    });

    sendPushToUser(newAssignedId, {
      title: 'Lead Transferido',
      body: `${req.user.name} te ha transferido el lead de ${reminder.clientName}`,
      url: `/#/reminders/${reminder.id}`
    });

    return res.json(updated);
  } catch (error) {
    console.error('Error transfiriendo recordatorio:', error);
    return res.status(500).json({ error: 'Error al transferir' });
  }
};

/**
 * Agregar nota de seguimiento
 */
const addFollowup = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || note.trim() === '') {
      return res.status(400).json({ error: 'La nota de seguimiento no puede estar vacía' });
    }

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) return res.status(404).json({ error: 'Recordatorio no encontrado' });

    if (req.user.role !== 'ADMIN' && reminder.assignedId !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const followup = await prisma.reminderFollowup.create({
      data: {
        reminderId: id,
        userId: req.user.id,
        note,
        actionType: 'NOTE'
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    });

    return res.status(201).json(followup);
  } catch (error) {
    console.error('Error agregando seguimiento:', error);
    return res.status(500).json({ error: 'Error al registrar seguimiento' });
  }
};

module.exports = {
  getReminders,
  createReminder,
  getReminderById,
  completeReminder,
  reopenReminder,
  dismissReminder,
  transferReminder,
  addFollowup
};
