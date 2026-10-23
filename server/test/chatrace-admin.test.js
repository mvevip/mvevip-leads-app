/**
 * Pruebas de los endpoints de administración de Chatrace (etiqueta fija y etiqueta por asesor).
 * Prisma falso + servidor HTTP local que simula Chatrace. La autorización (solo ADMIN) la aplica el middleware
 * `requireAdmin` en las rutas; aquí se comprueba la lógica de cada endpoint.
 */

const { test, describe, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const store = {}; // app_settings falso: settingKey -> { settingValue, updatedBy }
let settingsBroken = false;
const users = [{ id: 'asesor-1', name: 'Pedro', email: 'p@x.com', role: 'ASESOR' }, { id: 'admin-1', name: 'Admin', email: 'a@x.com', role: 'ADMIN' }];
const brokenTable = () => Object.assign(new Error('tabla inexistente'), { code: 'P2021', name: 'PrismaClientKnownRequestError' });

class FakePrisma {
  constructor() {
    this.user = {
      findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null,
      findMany: async () => users.map((u) => ({ ...u, _count: { assignedReminders: 0 } }))
    };
    this.appSetting = {
      findUnique: async ({ where }) => {
        if (settingsBroken) throw brokenTable();
        return store[where.settingKey] ? { settingValue: store[where.settingKey].settingValue } : null;
      },
      findMany: async ({ where }) => {
        if (settingsBroken) throw brokenTable();
        return where.settingKey.in.filter((k) => store[k]).map((k) => ({ settingKey: k, settingValue: store[k].settingValue }));
      },
      upsert: async ({ where, create, update }) => {
        if (settingsBroken) throw brokenTable();
        store[where.settingKey] = store[where.settingKey] ? { ...store[where.settingKey], ...update } : create;
        return store[where.settingKey];
      }
    };
  }
}
require('@prisma/client').PrismaClient = FakePrisma;

const admin = require('../src/controllers/adminController');
const chatrace = require('../src/services/chatraceService');

const TOKEN = 'token-secreto-de-prueba-123';
let server;
let baseUrl;
let requests;
let handler;
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

const call = async (fn, { body = {}, params = {}, user = { id: 'admin-1' } } = {}) => {
  let statusCode = 200;
  let payload;
  const res = { status(c) { statusCode = c; return this; }, json(p) { payload = p; return this; } };
  await fn({ body, params, user, query: {} }, res);
  return { status: statusCode, body: payload };
};

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { requests.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() }); handler(req, res); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  requests = [];
  Object.keys(store).forEach((k) => delete store[k]);
  settingsBroken = false;
  // Chatrace simulado: existen las etiquetas "Existente" (id 5) y se puede crear cualquier otra
  handler = (req, res) => {
    if (req.method === 'GET' && req.url === '/accounts/tags') return json(res, 200, [{ id: 5, name: 'Existente' }, { id: 6, name: 'Otra' }]);
    if (req.method === 'GET' && req.url === '/accounts/tags/name/Existente') return json(res, 200, { id: 5, name: 'Existente' });
    if (req.method === 'GET' && req.url.startsWith('/accounts/tags/name/')) return json(res, 404, {});
    if (req.method === 'POST' && req.url === '/accounts/tags') return json(res, 200, { id: 99 });
    return json(res, 500, {});
  };
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

describe('estado y lista de etiquetas', () => {
  test('status: configurado y sin etiqueta fija todavía', async () => {
    assert.deepEqual((await call(admin.getChatraceStatus)).body, { configured: true, settingsAvailable: true, fixedTag: null });
  });
  test('status sin token: configured=false, y no filtra nada', async () => {
    delete process.env.CHATRACE_API_TOKEN;
    const { body } = await call(admin.getChatraceStatus);
    assert.equal(body.configured, false);
    assert.ok(!JSON.stringify(body).includes(TOKEN));
  });
  test('status con la tabla de configuración inexistente: responde igual, avisando', async () => {
    settingsBroken = true;
    const { status, body } = await call(admin.getChatraceStatus);
    assert.equal(status, 200);
    assert.equal(body.settingsAvailable, false);
  });
  test('tags: lista las etiquetas de Chatrace', async () => {
    assert.deepEqual((await call(admin.getChatraceTags)).body.tags, [{ id: 5, name: 'Existente' }, { id: 6, name: 'Otra' }]);
  });
  test('tags sin token: 503 con mensaje claro', async () => {
    delete process.env.CHATRACE_API_TOKEN;
    const { status, body } = await call(admin.getChatraceTags);
    assert.equal(status, 503);
    assert.match(body.error, /no está activada/);
  });
  test('tags con Chatrace caído: 502 con mensaje amable', async () => {
    process.env.CHATRACE_BASE_URL = 'http://127.0.0.1:1';
    const { status, body } = await call(admin.getChatraceTags);
    assert.equal(status, 502);
    assert.match(body.error, /No se pudo consultar Chatrace/);
  });
});

describe('etiqueta fija', () => {
  test('elegir una existente', async () => {
    const { status, body } = await call(admin.setChatraceFixedTag, { body: { name: 'Existente' } });
    assert.equal(status, 200);
    assert.deepEqual(body, { fixedTag: 'Existente', created: false });
    assert.equal(store['chatrace.fixed_tag'].settingValue, 'Existente');
    assert.equal(store['chatrace.fixed_tag'].updatedBy, 'admin-1');
  });
  test('una que no existe NO se crea sin pedirlo (evita etiquetas por errores de tipeo)', async () => {
    const { status } = await call(admin.setChatraceFixedTag, { body: { name: 'Nueva' } });
    assert.equal(status, 404);
    assert.equal(store['chatrace.fixed_tag'], undefined);
    assert.ok(!requests.some((r) => r.method === 'POST'), 'no se creó nada en Chatrace');
  });
  test('create: true la crea en Chatrace y la guarda', async () => {
    const { status, body } = await call(admin.setChatraceFixedTag, { body: { name: 'Nueva', create: true } });
    assert.equal(status, 200);
    assert.deepEqual(body, { fixedTag: 'Nueva', created: true });
    assert.equal(store['chatrace.fixed_tag'].settingValue, 'Nueva');
  });
  test('nombre vacío quita la etiqueta (se guarda vacío, no se borra la fila)', async () => {
    store['chatrace.fixed_tag'] = { settingValue: 'Existente' };
    const { body } = await call(admin.setChatraceFixedTag, { body: { name: '' } });
    assert.equal(body.fixedTag, null);
    assert.equal(store['chatrace.fixed_tag'].settingValue, '');
    assert.equal((await call(admin.getChatraceStatus)).body.fixedTag, null);
  });
  test('nombre demasiado largo: 400', async () => {
    assert.equal((await call(admin.setChatraceFixedTag, { body: { name: 'x'.repeat(101), create: true } })).status, 400);
  });
  test('sin token: 503 y no guarda nada', async () => {
    delete process.env.CHATRACE_API_TOKEN;
    assert.equal((await call(admin.setChatraceFixedTag, { body: { name: 'Existente' } })).status, 503);
    assert.equal(store['chatrace.fixed_tag'], undefined);
  });
  test('la tabla de configuración no existe: error controlado (500), sin romper', async () => {
    settingsBroken = true;
    const { status, body } = await call(admin.setChatraceFixedTag, { body: { name: 'Existente' } });
    assert.equal(status, 500);
    assert.match(body.error, /No se pudo guardar/);
  });
});

describe('etiqueta por asesor', () => {
  test('asignar una existente a un asesor', async () => {
    const { status, body } = await call(admin.setUserChatraceTag, { params: { id: 'asesor-1' }, body: { name: 'Existente' } });
    assert.equal(status, 200);
    assert.deepEqual(body, { userId: 'asesor-1', chatraceTag: 'Existente', created: false });
    assert.equal(store['chatrace.advisor_tag.asesor-1'].settingValue, 'Existente');
  });
  test('usuario inexistente: 404', async () => {
    assert.equal((await call(admin.setUserChatraceTag, { params: { id: 'no-existe' }, body: { name: 'Existente' } })).status, 404);
  });
  test('etiqueta inexistente sin create: 404 y no se guarda', async () => {
    assert.equal((await call(admin.setUserChatraceTag, { params: { id: 'asesor-1' }, body: { name: 'asesor-pedro' } })).status, 404);
    assert.equal(store['chatrace.advisor_tag.asesor-1'], undefined);
  });
  test('create: true crea la etiqueta del asesor', async () => {
    const { body } = await call(admin.setUserChatraceTag, { params: { id: 'asesor-1' }, body: { name: 'asesor-pedro', create: true } });
    assert.equal(body.created, true);
    assert.equal(store['chatrace.advisor_tag.asesor-1'].settingValue, 'asesor-pedro');
  });
});

describe('lista de usuarios con su etiqueta', () => {
  test('cada usuario trae su chatraceTag (o null)', async () => {
    store['chatrace.advisor_tag.asesor-1'] = { settingValue: 'asesor-pedro' };
    const { body } = await call(admin.getUsers);
    assert.equal(body.find((u) => u.id === 'asesor-1').chatraceTag, 'asesor-pedro');
    assert.equal(body.find((u) => u.id === 'admin-1').chatraceTag, null);
  });
  test('si la tabla de configuración no existe, la lista de usuarios sale igual (sin romper el panel actual)', async () => {
    settingsBroken = true;
    const { status, body } = await call(admin.getUsers);
    assert.equal(status, 200);
    assert.equal(body.length, 2);
    assert.ok(body.every((u) => u.chatraceTag === null));
  });
});
