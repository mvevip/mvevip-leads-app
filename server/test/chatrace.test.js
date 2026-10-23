/**
 * Pruebas de la integración con Chatrace. Se ejecutan con `npm test` (node --test, sin dependencias).
 * Usan un servidor HTTP local que simula la API de Chatrace: nunca se llama a la API real ni se necesita token.
 */

const { test, describe, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const chatrace = require('../src/services/chatraceService');
const { syncReminderContact } = require('../src/services/chatraceSync');

const TOKEN = 'token-secreto-de-prueba-123';
const PHONE_RAW = '0991234567';
const PHONE_ID = '593991234567';
const CLIENT_NAME = 'Ana María Pérez Zambrano';

let server;
let baseUrl;
let requests;
let handler;

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const record = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
      requests.push(record);
      handler(record, res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  requests = [];
  handler = (req, res) => json(res, 200, {});
  process.env.CHATRACE_API_TOKEN = TOKEN;
  process.env.CHATRACE_BASE_URL = baseUrl;
  process.env.CHATRACE_DEFAULT_COUNTRY = '593';
  process.env.CHATRACE_TIMEOUT_MS = '1500';
  chatrace._resetCaches();
});

afterEach(() => {
  delete process.env.CHATRACE_API_TOKEN;
  delete process.env.CHATRACE_BASE_URL;
  delete process.env.CHATRACE_DEFAULT_COUNTRY;
  delete process.env.CHATRACE_TIMEOUT_MS;
});

/** Captura todo lo que se escribe a la consola mientras corre `fn` (para comprobar que los logs no filtran datos) */
const captureLogs = async (fn) => {
  const lines = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  ['log', 'warn', 'error'].forEach((k) => { console[k] = (...args) => lines.push(args.join(' ')); });
  try {
    return { result: await fn(), logs: lines.join('\n') };
  } finally {
    Object.assign(console, originals);
  }
};

const assertNoLeak = (text) => {
  assert.ok(!text.includes(TOKEN), 'el token no debe aparecer');
  assert.ok(!text.includes(PHONE_ID) && !text.includes(PHONE_RAW), 'el teléfono no debe aparecer');
  assert.ok(!text.includes('Ana') && !text.includes('Zambrano'), 'el nombre del cliente no debe aparecer');
};

describe('normalizePhone', () => {
  const cases = [
    ['0991234567', '593991234567'],
    ['099 123 4567', '593991234567'],
    ['+593 99 123 4567', '593991234567'],
    ['593991234567', '593991234567'],
    ['00593991234567', '593991234567'],
    ['991234567', '593991234567'],
    ['(02) 234-5678', '59322345678'],          // fijo de Ecuador
    ['+1 (305) 555-0123', '13055550123'],
    ['573001234567', '573001234567'],          // ya trae código de país
    ['+34 612 345 678', '34612345678']
  ];
  for (const [input, expected] of cases) {
    test(`"${input}" -> ${expected}`, () => assert.equal(chatrace.normalizePhone(input), expected));
  }

  const invalid = [null, undefined, '', '   ', 'sin número', '12345', '3055550123', '+593 99 12', '5939912345678901'];
  for (const input of invalid) {
    test(`${JSON.stringify(input)} no se reconoce (no adivina)`, () => assert.equal(chatrace.normalizePhone(input), null));
  }
});

describe('splitName', () => {
  test('separa nombre y apellidos', () => {
    assert.deepEqual(chatrace.splitName('Ana María Pérez'), { first_name: 'Ana', last_name: 'María Pérez' });
    assert.deepEqual(chatrace.splitName('  Nikita  '), { first_name: 'Nikita' });
  });
});

describe('syncContact', () => {
  test('contacto existente: agrega las etiquetas (en el id = teléfono con código de país)', async () => {
    handler = (req, res) => {
      if (req.method === 'GET' && req.url === `/contacts/${PHONE_ID}`) return json(res, 200, { id: Number(PHONE_ID) });
      if (req.url.startsWith('/accounts/tags/name/')) {
        const name = decodeURIComponent(req.url.split('/').pop());
        return json(res, 200, { id: name === 'Fija' ? 11 : 22, name });
      }
      if (req.method === 'POST' && req.url.startsWith(`/contacts/${PHONE_ID}/tags/`)) return json(res, 200, { success: true });
      return json(res, 500, {});
    };
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: ['Fija', 'Juan'] });
    assert.deepEqual(result, { status: 'synced', reason: 'tagged', created: false, tagsApplied: 2, tagsFailed: 0 });
    assert.ok(requests.every((r) => r.headers['x-access-token'] === TOKEN), 'todas las llamadas llevan X-ACCESS-TOKEN');
    const posts = requests.filter((r) => r.method === 'POST').map((r) => r.url).sort();
    assert.deepEqual(posts, [`/contacts/${PHONE_ID}/tags/11`, `/contacts/${PHONE_ID}/tags/22`]);
  });

  test('contacto nuevo: se crea con sus datos y las etiquetas (add_tag por nombre)', async () => {
    handler = (req, res) => {
      if (req.method === 'GET' && req.url === `/contacts/${PHONE_ID}`) return json(res, 404, { error: 'User not found' });
      if (req.method === 'POST' && req.url === '/contacts') return json(res, 200, { success: true });
      return json(res, 500, {});
    };
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: ['Fija', 'Fija', 'Juan'] });
    assert.deepEqual(result, { status: 'synced', reason: 'created', created: true, tagsApplied: 2, tagsFailed: 0 });
    const post = requests.find((r) => r.method === 'POST');
    assert.equal(post.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(post.body), {
      phone: `+${PHONE_ID}`,
      first_name: 'Ana',
      last_name: 'María Pérez Zambrano',
      actions: [{ action: 'add_tag', tag_name: 'Fija' }, { action: 'add_tag', tag_name: 'Juan' }]
    });
  });

  test('contacto nuevo sin etiquetas configuradas: se crea sin acciones', async () => {
    handler = (req, res) => (req.method === 'GET' ? json(res, 404, {}) : json(res, 200, {}));
    const result = await chatrace.syncContact({ name: 'Nikita', phone: PHONE_RAW, tags: [] });
    assert.equal(result.status, 'synced');
    assert.equal(JSON.parse(requests.find((r) => r.method === 'POST').body).actions, undefined);
  });

  test('etiqueta que no existe en Chatrace: parcial y se informa el motivo', async () => {
    handler = (req, res) => {
      if (req.url === `/contacts/${PHONE_ID}`) return json(res, 200, {});
      if (req.url === '/accounts/tags/name/Fija') return json(res, 200, { id: 11, name: 'Fija' });
      if (req.url === '/accounts/tags/name/Inexistente') return json(res, 404, {});
      return json(res, 200, { success: true });
    };
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: ['Fija', 'Inexistente'] });
    assert.equal(result.status, 'partial');
    assert.equal(result.reason, 'tag_missing');
    assert.equal(result.tagsApplied, 1);
    assert.equal(result.tagsFailed, 1);
  });

  test('sin token: se omite y no hace ninguna llamada', async () => {
    delete process.env.CHATRACE_API_TOKEN;
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: ['Fija'] });
    assert.deepEqual(result, { status: 'skipped', reason: 'disabled' });
    assert.equal(requests.length, 0);
  });

  test('sin teléfono o con teléfono inválido: se omite sin llamar a Chatrace', async () => {
    assert.deepEqual(await chatrace.syncContact({ name: 'X', phone: null, tags: ['Fija'] }), { status: 'skipped', reason: 'no_phone' });
    assert.deepEqual(await chatrace.syncContact({ name: 'X', phone: '12345', tags: ['Fija'] }), { status: 'skipped', reason: 'invalid_phone' });
    assert.equal(requests.length, 0);
  });

  test('401: falla con motivo "auth" y NO reintenta', async () => {
    handler = (req, res) => json(res, 401, { error: 'bad token' });
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: ['Fija'] });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'auth');
    assert.equal(requests.length, 1);
  });

  test('429 y luego 200: reintenta una sola vez y lo logra', async () => {
    let calls = 0;
    handler = (req, res) => {
      if (req.method === 'GET' && req.url === `/contacts/${PHONE_ID}`) {
        calls++;
        return calls === 1 ? json(res, 429, {}) : json(res, 404, {});
      }
      return json(res, 200, {});
    };
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: [] });
    assert.equal(result.status, 'synced');
    assert.equal(calls, 2);
  });

  test('500 persistente: un solo reintento y falla con motivo "server"', async () => {
    handler = (req, res) => json(res, 500, { error: 'boom' });
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: [] });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'server');
    assert.equal(requests.length, 2);
  });

  test('timeout: falla con motivo "timeout" sin colgar', async () => {
    process.env.CHATRACE_TIMEOUT_MS = '150';
    handler = () => { /* nunca responde */ };
    const started = Date.now();
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: [] });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'timeout');
    assert.ok(Date.now() - started < 1500, 'respeta el tiempo máximo');
  });

  test('sin tiempo en el turno (deadline casi vencido): ni siquiera llama', async () => {
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: [], deadline: Date.now() + 100 });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'timeout');
    assert.equal(requests.length, 0);
  });

  test('Chatrace caído (conexión rechazada): falla con motivo "network"', async () => {
    process.env.CHATRACE_BASE_URL = 'http://127.0.0.1:1';
    const result = await chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: [] });
    assert.equal(result.status, 'failed');
    assert.equal(result.reason, 'network');
  });

  test('los logs de un fallo no contienen token, teléfono ni nombre', async () => {
    handler = (req, res) => json(res, 500, { echo: `${PHONE_ID} ${CLIENT_NAME} ${TOKEN}` });
    const { result, logs } = await captureLogs(() => chatrace.syncContact({ name: CLIENT_NAME, phone: PHONE_RAW, tags: ['Fija'] }));
    assert.equal(result.status, 'failed');
    assert.ok(logs.includes('chatrace_sync_failed'), 'el fallo sí queda registrado');
    assertNoLeak(logs);
    assertNoLeak(JSON.stringify(result));
  });
});

describe('etiquetas', () => {
  test('listTags devuelve { id, name }', async () => {
    handler = (req, res) => json(res, 200, [{ id: 1, name: 'A', extra: 'x' }, { id: 2, name: 'B' }]);
    assert.deepEqual(await chatrace.listTags(), [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
  });

  test('createTag envía un formulario (x-www-form-urlencoded) con el nombre', async () => {
    handler = (req, res) => json(res, 200, { id: 1995 });
    const tag = await chatrace.createTag('  Cliente nuevo  ');
    assert.deepEqual(tag, { id: 1995, name: 'Cliente nuevo' });
    assert.equal(requests[0].headers['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(requests[0].body, 'name=Cliente+nuevo');
  });

  test('el id de una etiqueta se guarda en caché (una sola consulta)', async () => {
    handler = (req, res) => json(res, 200, { id: 7, name: 'Fija' });
    assert.equal(await chatrace.getTagId('Fija'), 7);
    assert.equal(await chatrace.getTagId('Fija'), 7);
    assert.equal(requests.length, 1);
  });
});

describe('syncReminderContact (lo que usa el chat: NUNCA lanza)', () => {
  const baseArgs = { reminderId: 'r1', userId: 'u1', clientName: CLIENT_NAME, clientPhone: PHONE_RAW, assignedId: 'asesor-1' };
  const okService = (spy = {}) => ({
    isEnabled: () => true,
    syncContact: async (args) => { spy.args = args; return { status: 'synced', reason: 'created', created: true, tagsApplied: 2, tagsFailed: 0 }; }
  });
  const settings = (fixed, advisor) => ({ getFixedTag: async () => fixed, getAdvisorTag: async () => advisor });

  test('arma las etiquetas: la fija + la del asesor asignado', async () => {
    const spy = {};
    const result = await syncReminderContact(baseArgs, { chatrace: okService(spy), settings: settings('MVEVIP', 'asesor-juan') });
    assert.equal(result.status, 'synced');
    assert.deepEqual(spy.args.tags, ['MVEVIP', 'asesor-juan']);
  });

  test('omite las etiquetas no configuradas', async () => {
    const spy = {};
    await syncReminderContact(baseArgs, { chatrace: okService(spy), settings: settings('MVEVIP', null) });
    assert.deepEqual(spy.args.tags, ['MVEVIP']);
  });

  test('integración desactivada: omite sin tocar nada', async () => {
    const deps = { chatrace: { isEnabled: () => false }, settings: settings('A', 'B') };
    assert.deepEqual(await syncReminderContact(baseArgs, deps), { status: 'skipped', reason: 'disabled' });
  });

  test('sin teléfono: omite con motivo "no_phone"', async () => {
    const result = await syncReminderContact({ ...baseArgs, clientPhone: null }, { chatrace: okService(), settings: settings('A', 'B') });
    assert.deepEqual(result, { status: 'skipped', reason: 'no_phone' });
  });

  test('al turno le queda poco tiempo: no sincroniza (se prioriza responder)', async () => {
    const result = await syncReminderContact({ ...baseArgs, deadline: Date.now() + 3000 }, { chatrace: okService(), settings: settings('A', 'B') });
    assert.deepEqual(result, { status: 'skipped', reason: 'no_time' });
  });

  test('la tabla de configuración aún no existe: sincroniza igual, sin etiquetas, y no lanza', async () => {
    const spy = {};
    const failing = { getFixedTag: async () => { throw Object.assign(new Error('table app_settings does not exist'), { code: 'P2021' }); }, getAdvisorTag: async () => null };
    const { result, logs } = await captureLogs(() => syncReminderContact(baseArgs, { chatrace: okService(spy), settings: failing }));
    assert.equal(result.status, 'synced');
    assert.deepEqual(spy.args.tags, []);
    assert.ok(logs.includes('settings_unavailable'));
    assert.ok(!logs.includes('table app_settings'), 'no se registra el mensaje del error');
  });

  test('el servicio revienta de forma inesperada: devuelve "failed" y NO lanza', async () => {
    const exploding = { isEnabled: () => true, syncContact: async () => { throw new Error(`boom ${PHONE_ID} ${CLIENT_NAME}`); } };
    const { result, logs } = await captureLogs(() => syncReminderContact(baseArgs, { chatrace: exploding, settings: settings('A', 'B') }));
    assert.deepEqual(result, { status: 'failed', reason: 'error' });
    assert.ok(logs.includes('chatrace_sync_failed'));
    assertNoLeak(logs);
  });

  test('con Chatrace real simulado y caído: el resultado es "failed" y no lanza', async () => {
    process.env.CHATRACE_BASE_URL = 'http://127.0.0.1:1';
    const { result, logs } = await captureLogs(() => syncReminderContact(baseArgs, { chatrace, settings: settings('MVEVIP', 'asesor-juan') }));
    assert.equal(result.status, 'failed');
    assertNoLeak(logs);
    assertNoLeak(JSON.stringify(result));
  });
});
