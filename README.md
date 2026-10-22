# MVEVIP Leads & Recordatorios PWA con Asistente IA 🚀

Aplicación Web Progresiva (PWA) para la fuerza comercial de MVEVIP. Integra la gestión de leads y recordatorios diarios con un **Asistente Virtual con IA (Google Gemini)** que consulta y actualiza recordatorios mediante herramientas acotadas (function calling), agenda citas por voz, texto o imagen, y envía notificaciones Web Push nativas sin costo adicional.

**URL de producción:** [https://leads.mvevip.com](https://leads.mvevip.com)  
**Documentación técnica completa:** [`MEMORIA_TECNICA.md`](./MEMORIA_TECNICA.md) (arquitectura, recursos AWS, seguridad, operación, despliegue y pendientes)

---

## 🌟 Características principales

- 🤖 **Asistente inteligente (Gemini)**:
  - Consulta en lenguaje natural el estado de leads y los pendientes del día.
  - Crea, reagenda y actualiza recordatorios, y agrega notas de seguimiento.
  - Entrada multimodal: texto, fotos de cotizaciones o clientes y notas de voz; arrastrar y soltar y pegado con `Ctrl + V`.
  - Seguro por diseño: usa seis herramientas sobre la base de datos, sin SQL libre y **sin ninguna herramienta de borrado**; un asesor solo accede a sus propios leads.
  - Límites de uso (15 mensajes por minuto por usuario) y respuestas siempre con texto: nunca queda una burbuja vacía.
- 📅 **Agenda y calendario multi-asesor**:
  - Los administradores filtran por uno, varios o todos los asesores.
  - Navegación táctil con deslizamiento entre días.
  - Línea de tiempo con el asesor responsable de cada cita.
  - En desktop, estación de trabajo con el asistente y la agenda lado a lado.
- 🔔 **Notificaciones Web Push (VAPID)**:
  - Gratuito y sin servicios externos de pago.
  - Compatible con iOS 16.4+ (PWA instalada) y Android (Chrome).
  - Recordatorios desatendidos: EventBridge ejecuta el cron cada minuto, con reintentos y sin envíos duplicados.
  - Sonido y vibración configurables.
- 🔒 **Privacidad y seguridad**:
  - Fotos de clientes y avatares privados, con URLs firmadas de corta vida.
  - Límite de intentos de login, sesiones revocables, verificación de origen desde CloudFront y límites de tráfico en el API Gateway.
- 📱 **Experiencia móvil**: color de barra de estado dinámico (claro y oscuro), áreas seguras para notch y aviso de nuevas versiones.

---

## 🛠️ Stack tecnológico

| Capa | Tecnologías |
|---|---|
| **Frontend** | React 19, Vite 6, Tailwind CSS 4, Axios, date-fns, Lucide Icons |
| **Backend** | Node.js 24 (Lambda), Express 4, `@google/generative-ai`, `web-push`, `@codegenie/serverless-express`, bcryptjs, JWT |
| **Base de datos** | MySQL 8, Prisma ORM (más consultas SQL directas para los contadores de límites y la versión de sesión) |
| **Infraestructura cloud** | AWS S3, CloudFront, API Gateway (HTTP), Lambda, RDS MySQL, EventBridge, CloudWatch Logs |
| **Contenedores (local)** | Docker y Docker Compose (puertos 6410, 6411 y 6412) |

---

## 🚀 Inicio rápido (desarrollo local con Docker)

### 1. Clonar el repositorio
```bash
git clone https://github.com/caloloc2/mvevip_leads_agente.git
cd mvevip_leads_agente
```

### 2. Configurar las variables de entorno
```bash
cp .env.example .env
```
Completa tus credenciales locales. Genera las claves VAPID si aún no las tienes:
```bash
npx web-push generate-vapid-keys
```
`JWT_SECRET` es **obligatoria**: sin ella el servidor no arranca.

### 3. Levantar los contenedores
```bash
docker compose up -d --build
```

### 4. Puertos locales
- **Frontend PWA:** [http://localhost:6410](http://localhost:6410)
- **Backend API:** [http://localhost:6411](http://localhost:6411)
- **MySQL:** `localhost:6412`

> Si agregas una dependencia a `server/package.json`, instálala también en el contenedor con `docker exec mvevip_lead_server npm install`: `/app/node_modules` es un volumen anónimo y no se actualiza al reconstruir la imagen.

---

## ☁️ Despliegue en AWS

Requiere AWS CLI con el perfil `marketingvip` y permisos sobre S3 (`mvevip-leads`), CloudFront (`E2FMW6HOSKOVMP`) y Lambda (`mvevip-lead-api`).

```powershell
.\deploy\deploy-aws.ps1 -DeployBackend   # Backend (Lambda) + frontend (S3) + invalidación de CloudFront
.\deploy\deploy-aws.ps1                  # Solo frontend
```

`package-lambda.ps1` instala las dependencias en el contenedor, genera el cliente de Prisma, empaqueta y **verifica el contenido del zip** (descarta el paquete si falta alguna dependencia). Antes de desplegar el backend, haz una copia del zip actual en `s3://mvevip-leads/deployments/backup/`. Más detalle, reversión y procedimientos de operación en la sección 7 y 8 de [`MEMORIA_TECNICA.md`](./MEMORIA_TECNICA.md).

Los cambios de esquema de la base de datos son scripts SQL numerados en [`deploy/migrations/`](./deploy/migrations/), que se ejecutan a mano **antes** de desplegar el código que los usa.

---

## 🔒 Variables de entorno

`.env.example` lista todas las variables. Las principales:

| Variable | Descripción |
|---|---|
| `PORT_FRONTEND`, `PORT_BACKEND`, `PORT_DB` | Puertos locales (`6410`, `6411`, `6412`) |
| `TZ` | Zona horaria (`America/Guayaquil`) |
| `DATABASE_URL` | Conexión de Prisma a MySQL |
| `JWT_SECRET` | **Obligatoria.** Firma de tokens (vigencia 5 días, `JWT_EXPIRES_IN`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push |
| `GEMINI_API_KEY` | Clave de Google Gemini |
| `S3_BUCKET_NAME`, `CLOUDFRONT_DOMAIN` | Archivos subidos (solo producción) |
| `MEDIA_SIGNER_ACCESS_KEY_ID`, `MEDIA_SIGNER_SECRET_ACCESS_KEY` | Claves del usuario IAM de solo lectura que firma las URLs de imágenes |
| `ORIGIN_VERIFY_SECRET`, `ORIGIN_VERIFY_MODE`, `ORIGIN_VERIFY_SECRET_PREVIOUS` | Verificación de origen desde CloudFront (`off` / `log` / `enforce`) |
| `CORS_ORIGINS`, `CRON_SECRET` | Opcionales: orígenes permitidos y habilitación de la ruta HTTP del cron |

---

## 📁 Estructura del proyecto

```
mvevip_lead_app/
├── client/            # Frontend (React + Vite PWA)
├── server/            # Backend (Express + handler de Lambda)
├── deploy/            # Scripts de despliegue, políticas AWS, esquema SQL y migraciones
├── .env.example       # Plantilla de variables de entorno (sin secretos)
├── docker-compose.yml # Servicios locales
├── MEMORIA_TECNICA.md # Arquitectura, operación, seguridad, historial y pendientes
└── README.md
```

---

## 📄 Licencia

Este proyecto es propiedad privada de **MVEVIP**. Todos los derechos reservados.
