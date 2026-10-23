-- Migración 002 (PENDIENTE DE EJECUTAR): configuración de la integración con Chatrace
-- Ejecutar con un usuario con permiso CREATE sobre mvevip_lead, ANTES de desplegar el backend que la usa.
-- Es idempotente (IF NOT EXISTS): correrla dos veces no da error ni cambia nada.
-- Solo CREA una tabla nueva: no modifica ninguna tabla existente, así que el código actual sigue funcionando
-- aunque se ejecute antes o después del despliegue.
-- Verificación: 002_chatrace_verify.sql | Reversión: 002_chatrace_rollback.sql
USE mvevip_lead;

-- Configuración clave/valor de la app. Claves de la integración con Chatrace:
--   chatrace.fixed_tag             -> nombre de la etiqueta fija (se aplica a todos los contactos sincronizados)
--   chatrace.advisor_tag.<userId>  -> nombre de la etiqueta de ese asesor
CREATE TABLE IF NOT EXISTS `app_settings` (
  `settingKey` VARCHAR(191) NOT NULL,
  `settingValue` VARCHAR(500) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `updatedBy` VARCHAR(191) NULL,
  PRIMARY KEY (`settingKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
