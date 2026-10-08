# MVEVIP Leads & Recordatorios PWA con Asistente IA 🚀

Aplicación Web Progresiva (PWA) de alto impacto diseñada para la fuerza comercial de MVEVIP. Integra gestión en tiempo real de leads y recordatorios diarios con un **Asistente Virtual con IA (Google Gemini Flash)** capaz de consultar la base de datos de producción mediante Function Calling seguro, agendar citas por voz/texto y enviar notificaciones Web Push nativas sin costo adicional.

**URL de Producción:** [https://leads.mvevip.com](https://leads.mvevip.com)  
**Documentación Interna:** Ver [`MEMORIA_TECNICA.md`](./MEMORIA_TECNICA.md)

---

## 🌟 Características Principales

- 🤖 **Asistente Inteligente Gemini Flash**:
  - Consulta en lenguaje natural el estado de leads, cotizaciones y pendientes del día.
  - Creación y reagendamiento automático de citas en la base de datos.
  - Entrada multimodal: texto, fotos de cotizaciones/clientes y notas de voz.
  - Blindaje estricto: prohibición absoluta de borrado (`DELETE`/`DROP`), restricción a la base de datos `mvevip_leads`, y filtrado automático de permisos por asesor/administrador.
- 📅 **Agenda y Calendario Multi-Asesor**:
  - Selector interactivo con checkboxes para que los administradores puedan filtrar y visualizar agendas simultáneas de varios asesores.
  - Navegación táctil tipo swipe horizontal entre días (ayer, hoy, mañana, etc.).
  - Línea de tiempo con badges del asesor responsable por cita.
- 🔔 **Notificaciones Web Push (VAPID)**:
  - Sistema 100% gratuito sin dependencias de servicios externos de pago.
  - Compatible con iOS 16.4+ (PWA en pantalla de inicio) y dispositivos Android (Chrome).
  - Recordatorios desatendidos ejecutados vía Amazon EventBridge cada minuto.
- 📱 **Experiencia Móvil Optimizada**:
  - Color de barra de estado dinámico (`theme-color`) sincronizado con los modos claro y oscuro.
  - Soporte completo para notch / isla dinámica mediante áreas seguras (`safe-area-inset-top`).
  - Detección fluida de actualizaciones y soporte sin conexión gracias a Service Worker.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS, Lucide Icons, Date-fns |
| **Backend** | Node.js 20, Express, `@google/genai` (Gemini SDK), `web-push`, `serverless-http` |
| **Base de Datos** | MySQL 8.0, Prisma ORM, mysql2 |
| **Infraestructura Cloud** | AWS S3, AWS CloudFront, AWS Lambda, Amazon RDS MySQL, Amazon EventBridge |
| **Contenedores** | Docker & Docker Compose (Puertos asignados: 6410, 6411, 6412) |

---

## 🚀 Inicio Rápido (Desarrollo Local con Docker)

### 1. Clonar el Repositorio
```bash
git clone https://github.com/caloloc2/mvevip_leads_agente.git
cd mvevip_leads_agente
```

### 2. Configurar Variables de Entorno
Copia el archivo de ejemplo y completa tus credenciales locales:
```bash
cp .env.example .env
```

Genera tus claves VAPID gratuitas si aún no las tienes:
```bash
npx web-push generate-vapid-keys
```

### 3. Levantar los Contenedores
El proyecto utiliza Docker Compose para aislar todos los servicios en el rango de puertos `6410 - 6420`:
```bash
docker compose up -d --build
```

### 4. Puertos de Acceso Local
- **Frontend PWA:** [http://localhost:6410](http://localhost:6410)
- **Backend API:** [http://localhost:6411](http://localhost:6411)
- **MySQL Directo:** `localhost:6412`

---

## ☁️ Despliegue en AWS

El proyecto incluye scripts en PowerShell para desplegar automáticamente al entorno de producción en AWS:

### Requisitos Previos
- AWS CLI configurado con el perfil `marketingvip`.
- Permisos sobre S3 (`mvevip-leads`), CloudFront (`E2FMW6HOSKOVMP`) y Lambda (`mvevip-lead-api`).

### Comandos de Despliegue

**Despliegue Completo (Backend Lambda + Frontend S3 + Invalidación CloudFront):**
```powershell
.\deploy\deploy-aws.ps1 -DeployBackend
```

**Despliegue Rápido (Solo Frontend):**
```powershell
.\deploy\deploy-aws.ps1
```

---

## 🔒 Variables de Entorno

Revisa `.env.example` para la lista completa de variables requeridas:

| Variable | Descripción |
|---|---|
| `PORT_FRONTEND` | Puerto local del cliente Vite (`6410`) |
| `PORT_BACKEND` | Puerto local de la API Express (`6411`) |
| `PORT_DB` | Puerto local expuesto de MySQL (`6412`) |
| `TZ` | Zona horaria del servidor (`America/Guayaquil`) |
| `DATABASE_URL` | Cadena de conexión interna para Prisma/MySQL |
| `JWT_SECRET` | Llave secreta para firmar tokens JWT (validez 5 días) |
| `VAPID_PUBLIC_KEY` | Clave pública VAPID para suscripción push en el cliente |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID para envío de notificaciones push |
| `GEMINI_API_KEY` | Llave de API de Google Gemini para el asistente IA |

---

## 📁 Estructura del Proyecto

```
mvevip_lead_app/
├── client/                     # Código fuente Frontend (React + Vite PWA)
├── server/                     # Código fuente Backend (Express API & Lambda)
├── deploy/                     # Scripts de despliegue y configuraciones AWS
├── .env.example                # Plantilla de variables de entorno (sin secretos)
├── .gitignore                  # Reglas de exclusión para Git
├── docker-compose.yml          # Configuración de servicios Docker locales
├── MEMORIA_TECNICA.md          # Registro exhaustivo de arquitectura y cambios
└── README.md                   # Documentación principal
```

---

## 📄 Licencia

Este proyecto es propiedad privada de **MVEVIP**. Todos los derechos reservados.
