-- Verificación de la migración 002: SOLO LECTURA (SHOW / SELECT). Ejecutar después de 002_chatrace.sql.
USE mvevip_lead;

-- 1) Debe devolver una fila con la tabla `app_settings`
SHOW TABLES LIKE 'app_settings';

-- 2) Debe mostrar las columnas settingKey (PK), settingValue, updatedAt y updatedBy
SHOW COLUMNS FROM `app_settings`;

-- 3) Al inicio devuelve 0; después de configurar etiquetas en la app, una fila por cada etiqueta configurada
SELECT COUNT(*) AS filas FROM `app_settings`;

-- 4) Comprobar que las tablas existentes siguen intactas (deben salir los mismos nombres de siempre)
SHOW TABLES;
