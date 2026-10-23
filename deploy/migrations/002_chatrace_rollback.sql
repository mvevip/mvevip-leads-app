-- Reversión de la migración 002: elimina SOLO la tabla nueva `app_settings`.
-- ATENCIÓN: borra la configuración guardada (etiqueta fija y etiquetas por asesor). Nada más usa esta tabla.
-- No hace falta ejecutarla para apagar la integración: basta quitar CHATRACE_API_TOKEN de la Lambda.
-- Si el backend con la integración sigue desplegado, la configuración se verá vacía (la integración sigue sin romper nada).
USE mvevip_lead;

DROP TABLE IF EXISTS `app_settings`;
