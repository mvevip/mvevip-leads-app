-- Migración 001 (ejecutada en producción el 2026-10-21): límite de intentos y versión de sesión
USE mvevip_lead;

CREATE TABLE IF NOT EXISTS `rate_limit_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bucket` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `rate_limit_events_bucket_createdAt_idx` (`bucket`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `users`
  ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 0,
  ALGORITHM = INSTANT;
