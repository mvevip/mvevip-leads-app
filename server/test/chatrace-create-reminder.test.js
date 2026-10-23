/**
 * Prueba de punta a punta de la herramienta `create_reminder` del asistente con la integración de Chatrace.
 * Prisma se sustituye por uno falso (no hay base de datos) y Chatrace por un servidor HTTP local.
 * Garantía que se comprueba: el recordatorio se crea y la respuesta es la de siempre, pase lo que pase con Chatrace.
 */

const { test, describe, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// --- Prisma falso: debe instalarse ANTES de cargar los módulos del servidor ---
const createdReminders = [];
let settings = {};
class FakePrisma {
  constructor() {
    this.reminder = {
      create: async ({ data }) => {
        const row = { id: `rem-${createdReminders.length + 1}`, ...data };
        createdReminders.push(row);
        return row;
      }
    };
    this.user = { findFirst: async ({ where }) => (where?.name?.contains === 'Juan' ? { id: 'asesor-juan-id' } : null) };
    this.appSetting = {
      findUnique: async ({ where }) => (settings[where.settingKey] ? { settingValue: settings[where.settingKey] } : null)
    };
  }
}
require('@prisma/client').PrismaClient = FakePrisma;

const { executeTool } = require('../src/services/geminiService');
const chatrace = require('../src/services/chatraceService');

const TOKEN = 'token-secreto-de-prueba-123';
const PHONE_RAW = '0991234567';
const PHONE_ID = '593991234567';
const CLIENT_NAME = 'Ana Pérez';
const ADMIN = { id: 'admin-1', name: 'Admin', role: 'ADMIN' };
const ASESOR = { id: 'asesor-1', name: 'Pedro', role: 'ASESOR' };
const args = (extra = {}) => ({
  clientName: CLIENT_NAME,
  clientPhone: PHONE_RAW,
  title: 'Enviar cotización',
  scheduledAt: '2026-11-02T15:00:00.000Z',
  ...extra
});
const EXPECTED_MESSAGE = `Compromiso para ${CLIENT_NAME} creado exitosamente para el 2026-11-02T15:00:00.000Z.`;

let server;
let baseUrl;
let requests;
let handler;
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() });
      handler(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  requests = [];
  createdReminders.length = 0;
  settings = { 'chatrace.fixed_tag': 'MVEVIP', 'chatrace.advisor_tag.asesor-1': 'asesor-pedro', 'chatrace.advisor_tag.asesor-juan-id': 'asesor-juan' };
  handler = (req, res) => json(res, 200, {});
  process.env.CHATRACE_API_TOKEN = TOKEN;
  process.env.CHATRACE_BASE_URL = baseUrl;
  process.env.CHATRACE_TIMEOUT_MS = '1500';
  chatrace._resetCaches();
});
afterEach(() => {
  delete process.env.CHATRACE_API_TOKEN;
  delete process.env.CHATRACE_BASE_URL;
  delete process.env.CHATRACE_TIMEOUT_MS;
});

const captureLogs = async (fn) => {
  const lines = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  ['log', 'warn', 'error'].forEach((k) => { console[k] = (...a) => lines.push(a.join(' ')); });
  try { return { result: await fn(), logs: lines.join('\n') }; } finally { Object.assign(console, originals); }
};

describe('create_reminder con Chatrace', () => {
  test('contacto existente: crea el recordatorio, etiqueta con la fija + la del asesor y lo informa', async () => {
    handler = (req, res) => {
      if (req.url === `/contacts/${PHONE_ID}`) return json(res, 200, { id: 1 });
      if (req.url.startsWith('/accounts/tags/name/')) return json(res, 200, { id: req.url.endsWith('MVEVIP') ? 11 : 22 });
      return json(res, 200, { success: true });
    };
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
    assert.equal(result.success, true);
    assert.equal(result.message, EXPECTED_MESSAGE);
    assert.equal(createdReminders.length, 1);
    assert.equal(result.chatrace.status, 'synced');
    assert.equal(result.chatrace.created, false);
    assert.match(result.chatrace.message, /ya existía en Chatrace/);
    const tagged = requests.filter((r) => r.method === 'POST').map((r) => r.url).sort();
    assert.deepEqual(tagged, [`/contacts/${PHONE_ID}/tags/11`, `/contacts/${PHONE_ID}/tags/22`]);
  });

  test('contacto nuevo: lo crea con las dos etiquetas', async () => {
    handler = (req, res) => (req.method === 'GET' ? json(res, 404, {}) : json(res, 200, {}));
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
    assert.equal(result.chatrace.status, 'synced');
    assert.equal(result.chatrace.created, true);
    const body = JSON.parse(requests.find((r) => r.method === 'POST').body);
    assert.deepEqual(body.actions, [{ action: 'add_tag', tag_name: 'MVEVIP' }, { action: 'add_tag', tag_name: 'asesor-pedro' }]);
  });

  test('un ADMIN asigna a otro asesor: se usa la etiqueta del asesor ASIGNADO', async () => {
    handler = (req, res) => (req.method === 'GET' ? json(res, 404, {}) : json(res, 200, {}));
    await executeTool('create_reminder', args({ assignedToAdvisorName: 'Juan' }), ADMIN, new Date(), Date.now() + 24000);
    assert.equal(createdReminders[0].assignedId, 'asesor-juan-id');
    const body = JSON.parse(requests.find((r) => r.method === 'POST').body);
    assert.deepEqual(body.actions.map((a) => a.tag_name), ['MVEVIP', 'asesor-juan']);
  });

  test('CHATRACE CAÍDO: el recordatorio se crea y la respuesta es la de siempre (solo se agrega el aviso)', async () => {
    process.env.CHATRACE_BASE_URL = 'http://127.0.0.1:1';
    const { result, logs } = await captureLogs(() => executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000));
    assert.equal(result.success, true);
    assert.equal(result.message, EXPECTED_MESSAGE);
    assert.ok(result.reminderId);
    assert.equal(result.error, undefined);
    assert.equal(createdReminders.length, 1);
    assert.equal(result.chatrace.status, 'failed');
    assert.match(result.chatrace.message, /el compromiso quedó creado igualmente/);
    assert.ok(logs.includes('chatrace_sync_failed'), 'el fallo queda en los logs');
    assert.ok(!logs.includes(TOKEN) && !logs.includes(PHONE_ID) && !logs.includes('Ana'), 'sin datos personales en los logs');
  });

  test('CHATRACE LENTO (no responde): termina en tiempo acotado y el recordatorio queda creado', async () => {
    process.env.CHATRACE_TIMEOUT_MS = '200';
    handler = () => { /* nunca responde */ };
    const started = Date.now();
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
    assert.ok(Date.now() - started < 2500);
    assert.equal(result.success, true);
    assert.equal(createdReminders.length, 1);
    assert.equal(result.chatrace.status, 'failed');
    assert.equal(result.chatrace.reason, 'timeout');
  });

  test('token inválido (401): recordatorio creado y fallo avisado', async () => {
    handler = (req, res) => json(res, 401, {});
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
    assert.equal(result.success, true);
    assert.equal(result.chatrace.status, 'failed');
    assert.equal(result.chatrace.reason, 'auth');
  });

  test('sin teléfono: crea el recordatorio, avisa y no llama a Chatrace', async () => {
    const result = await executeTool('create_reminder', args({ clientPhone: undefined }), ASESOR, new Date(), Date.now() + 24000);
    assert.equal(result.success, true);
    assert.equal(result.chatrace.status, 'skipped');
    assert.equal(result.chatrace.reason, 'no_phone');
    assert.match(result.chatrace.message, /no tiene el teléfono/);
    assert.equal(requests.length, 0);
  });

  test('al turno le queda poco tiempo: no se sincroniza y se responde con normalidad', async () => {
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 2000);
    assert.equal(result.success, true);
    assert.equal(result.chatrace.reason, 'no_time');
    assert.equal(requests.length, 0);
  });

  test('integración DESACTIVADA (sin token): la respuesta es idéntica a la de antes de existir Chatrace', async () => {
    delete process.env.CHATRACE_API_TOKEN;
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
    assert.deepEqual(result, { success: true, message: EXPECTED_MESSAGE, reminderId: 'rem-1' });
    assert.equal(requests.length, 0);
  });

  test('la tabla de configuración aún no existe: el recordatorio se crea igual', async () => {
    const prismaShared = require('../src/utils/prismaClient');
    const keep = prismaShared.appSetting.findUnique;
    prismaShared.appSetting.findUnique = async () => { throw Object.assign(new Error('tabla inexistente'), { code: 'P2021' }); };
    try {
      handler = (req, res) => (req.method === 'GET' ? json(res, 404, {}) : json(res, 200, {}));
      const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
      assert.equal(result.success, true);
      assert.equal(createdReminders.length, 1);
      assert.equal(result.chatrace.status, 'synced');
      assert.equal(JSON.parse(requests.find((r) => r.method === 'POST').body).actions, undefined);
    } finally {
      prismaShared.appSetting.findUnique = keep;
    }
  });

  test('el aviso de Chatrace nunca incluye teléfono ni nombre del cliente', async () => {
    handler = (req, res) => (req.method === 'GET' ? json(res, 404, {}) : json(res, 200, {}));
    const result = await executeTool('create_reminder', args(), ASESOR, new Date(), Date.now() + 24000);
    const text = JSON.stringify(result.chatrace);
    assert.ok(!text.includes(PHONE_ID) && !text.includes(PHONE_RAW) && !text.includes('Ana') && !text.includes(TOKEN));
  });
});
