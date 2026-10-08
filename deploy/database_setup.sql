-- ==============================================================================
-- MVEVIP LEAD MANAGEMENT APP - ESQUEMA DE PRODUCCIÓN MYSQL
-- Servidor Recomendado: database-mvevip.c98k2yme6fe6.us-west-2.rds.amazonaws.com
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `mvevip_lead` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `mvevip_lead`;

-- 1. Tabla de Usuarios (Administradores y Asesores)
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `role` ENUM('ADMIN', 'ASESOR') NOT NULL DEFAULT 'ASESOR',
  `avatarUrl` LONGTEXT NULL,
  `phone` VARCHAR(191) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `mustChangePassword` BOOLEAN NOT NULL DEFAULT FALSE,
  `isFirstLogin` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Suscripciones Web Push (Alertas con pantalla apagada)
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dhKey` TEXT NOT NULL,
  `authKey` TEXT NOT NULL,
  `userAgent` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `push_subscriptions_userId_idx` (`userId`),
  CONSTRAINT `push_subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Etiquetas (Tags de clasificación de leads)
CREATE TABLE IF NOT EXISTS `tags` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `colorHex` VARCHAR(191) NOT NULL DEFAULT '#3B82F6',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tags_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Recordatorios y Gestiones de Leads
CREATE TABLE IF NOT EXISTS `reminders` (
  `id` VARCHAR(191) NOT NULL,
  `creatorId` VARCHAR(191) NOT NULL,
  `assignedId` VARCHAR(191) NOT NULL,
  `clientName` VARCHAR(191) NOT NULL,
  `clientPhone` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `scheduledAt` DATETIME(3) NOT NULL,
  `status` ENUM('PENDING', 'COMPLETED', 'TRANSFERRED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `dismissReason` TEXT NULL,
  `sourceType` ENUM('MANUAL', 'BOT_VOICE', 'BOT_IMAGE', 'BOT_TEXT') NOT NULL DEFAULT 'MANUAL',
  `mediaUrl` TEXT NULL,
  `notificationSent` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `reminders_assignedId_scheduledAt_idx` (`assignedId`, `scheduledAt`),
  KEY `reminders_status_scheduledAt_idx` (`status`, `scheduledAt`),
  KEY `reminders_creatorId_idx` (`creatorId`),
  CONSTRAINT `reminders_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `reminders_assignedId_fkey` FOREIGN KEY (`assignedId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de Bitácora / Seguimientos (Historial de cambios y notas del lead)
CREATE TABLE IF NOT EXISTS `reminder_followups` (
  `id` VARCHAR(191) NOT NULL,
  `reminderId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `note` TEXT NOT NULL,
  `actionType` ENUM('NOTE', 'RESCHEDULE', 'STATUS_CHANGE', 'TRANSFER') NOT NULL DEFAULT 'NOTE',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `reminder_followups_reminderId_idx` (`reminderId`),
  CONSTRAINT `reminder_followups_reminderId_fkey` FOREIGN KEY (`reminderId`) REFERENCES `reminders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `reminder_followups_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla Intermedia de Etiquetas por Recordatorio
CREATE TABLE IF NOT EXISTS `reminder_tags` (
  `reminderId` VARCHAR(191) NOT NULL,
  `tagId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`reminderId`, `tagId`),
  CONSTRAINT `reminder_tags_reminderId_fkey` FOREIGN KEY (`reminderId`) REFERENCES `reminders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `reminder_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- INSERCIÓN DE DATOS BASE OBLIGATORIOS (SIN DATOS DE PRUEBA)
-- ==============================================================================

-- Etiquetas oficiales de seguimiento
INSERT INTO `tags` (`id`, `name`, `colorHex`, `createdAt`)
VALUES 
  (UUID(), 'Confirmar Pago', '#10B981', NOW(3)),
  (UUID(), 'Agendar Demo', '#6366F1', NOW(3)),
  (UUID(), 'Llamada Urgente', '#EF4444', NOW(3)),
  (UUID(), 'Enviar Cotización', '#F59E0B', NOW(3))
ON DUPLICATE KEY UPDATE `colorHex` = VALUES(`colorHex`);

-- Usuario Administrador Único
-- Correo: calolomino@gmail.com
-- Contraseña Temporal: Generada con hash bcrypt (requiere cambio obligatorio en primer inicio)
-- (Con mustChangePassword = 1 e isFirstLogin = 1 para forzar ingreso de clave personal y foto)
INSERT INTO `users` (
  `id`, 
  `name`, 
  `email`, 
  `passwordHash`, 
  `role`, 
  `avatarUrl`, 
  `phone`, 
  `isActive`, 
  `mustChangePassword`, 
  `isFirstLogin`, 
  `createdAt`, 
  `updatedAt`
) VALUES (
  UUID(),
  'Carlos Miño',
  'calolomino@gmail.com',
  '$2b$10$O3km8oLTNaxYd4ysOaVj2uJX/jM6dRI3LjLCnrM8RxNJF3GWZviDu',
  'ADMIN',
  NULL,
  NULL,
  1,
  1,
  1,
  NOW(3),
  NOW(3)
)
ON DUPLICATE KEY UPDATE 
  `role` = 'ADMIN',
  `mustChangePassword` = 1,
  `isFirstLogin` = 1;
