/**
 * Cliente de la API de Chatrace (https://api.chatrace.com/swagger/).
 *
 * Principios:
 * - Es OPCIONAL: sin CHATRACE_API_TOKEN la integración queda desactivada y todo devuelve "skipped".
 * - Nunca debe romper el chat ni los recordatorios: los llamadores lo usan dentro de su propio try/catch.
 * - Los errores son saneados: nunca incluyen teléfono, nombre, token ni el cuerpo de la respuesta.
 * - El id de un contacto en Chatrace es su teléfono con código de país (solo dígitos).
 */

const { logWarn } = require('../utils/logger');

const DEFAULT_BASE_URL = 'https://api.chatrace.com';
const DEFAULT_TIMEOUT_MS = 4000;     // Timeout máximo por llamada
const MIN_CALL_BUDGET_MS = 500;      // Si queda menos tiempo que esto, ni se intenta
const RETRY_DELAY_MS = 300;          // Espera antes del único reintento ante 429/5xx
const RETRY_MIN_REMAINING_MS = 2000; // Solo se reintenta si queda al menos este tiempo
const TAG_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_NAME_CHARS = 100;

// Se lee en cada llamada (no al cargar el módulo) para poder cambiar las variables en las pruebas
const getConfig = () => ({
  token: process.env.CHATRACE_API_TOKEN || '',
  baseUrl: (process.env.CHATRACE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  defaultCountry: (process.env.CHATRACE_DEFAULT_COUNTRY || '593').replace(/\D/g, '') || '593',
  timeoutMs: parseInt(process.env.CHATRACE_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS
});

const isEnabled = () => Boolean(getConfig().token);

/** Error con mensaje seguro: solo la categoría y el estado HTTP, jamás datos del cliente ni la respuesta */
class ChatraceError extends Error {
  constructor(kind, status) {
    super(status ? `Chatrace ${kind} (${status})` : `Chatrace ${kind}`);
    this.name = 'ChatraceError';
    this.kind = kind;
    this.status = status;
  }
}

const classifyStatus = (status) => {
  if (status === 401 || status === 403) return { kind: 'auth', retryable: false };
  if (status === 429) return { kind: 'rate_limited', retryable: true };
  if (status >= 500) return { kind: 'server', retryable: true };
  return { kind: 'bad_request', retryable: false };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normaliza un teléfono a dígitos con código de país (el id del contacto en Chatrace).
 * Devuelve null si no lo reconoce: NO adivina, para no sincronizar un número equivocado.
 */
const normalizePhone = (raw, defaultCountry = getConfig().defaultCountry) => {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const hasPlus = text.startsWith('+');
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;

  if (!hasPlus) {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);                                   // 00593... -> 593...
    } else if (digits.startsWith('0')) {
      digits = defaultCountry + digits.slice(1);                  // 0991234567 -> 593991234567
    } else if (defaultCountry === '593' && digits.length === 9 && digits.startsWith('9')) {
      digits = defaultCountry + digits;                           // 991234567 -> 593991234567
    } else if (!digits.startsWith(defaultCountry) && digits.length < 11) {
      return null;                                                // Sin país y ambiguo: no se adivina
    }
  }

  // Ecuador: 593 + 8 dígitos (fijo) o 9 (celular). Resto de países: longitud E.164 (hasta 15 dígitos)
  if (digits.startsWith('593')) return digits.length === 11 || digits.length === 12 ? digits : null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

/**
 * Llamada HTTP a Chatrace con timeout acotado por el tiempo que le queda al turno (deadline).
 * Devuelve { status, data }. Un 404 se devuelve tal cual (el llamador decide); el resto de errores lanza ChatraceError.
 */
const request = async (method, path, { json, form, deadline, retried = false } = {}) => {
  const config = getConfig();
  if (!config.token) throw new ChatraceError('disabled');

  const remaining = deadline ? deadline - Date.now() : Infinity;
  if (remaining < MIN_CALL_BUDGET_MS) throw new ChatraceError('timeout');
  const timeoutMs = Math.min(config.timeoutMs, remaining);

  const headers = { 'X-ACCESS-TOKEN': config.token, Accept: 'application/json' };
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }

  let response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new ChatraceError(isTimeout ? 'timeout' : 'network');
  }

  if (response.status === 404) return { status: 404, data: null };

  if (!response.ok) {
    const { kind, retryable } = classifyStatus(response.status);
    const canRetry = retryable && !retried && (deadline ? deadline - Date.now() : Infinity) > RETRY_MIN_REMAINING_MS;
    if (canRetry) {
      await sleep(RETRY_DELAY_MS);
      return request(method, path, { json, form, deadline, retried: true });
    }
    throw new ChatraceError(kind, response.status);
  }

  let data = null;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null; // Respuesta sin JSON válido: no es un error si el estado fue 2xx
  }
  return { status: response.status, data };
};

// --- Etiquetas -------------------------------------------------------------------------------------------------

const tagIdCache = new Map(); // nombre -> { id, expiresAt }

/** Lista las etiquetas de la cuenta de Chatrace: [{ id, name }] */
const listTags = async ({ deadline } = {}) => {
  const { data } = await request('GET', '/accounts/tags', { deadline });
  return Array.isArray(data) ? data.map((t) => ({ id: t.id, name: t.name })) : [];
};

/** Crea una etiqueta (formulario, como indica la documentación). Devuelve { id, name } */
const createTag = async (name, { deadline } = {}) => {
  const clean = String(name || '').trim().slice(0, MAX_NAME_CHARS);
  if (!clean) throw new ChatraceError('bad_request');
  const { data } = await request('POST', '/accounts/tags', { form: { name: clean }, deadline });
  const id = data?.id;
  if (id) tagIdCache.set(clean, { id, expiresAt: Date.now() + TAG_CACHE_TTL_MS });
  return { id, name: clean };
};

/** Id de una etiqueta por su nombre (con caché breve para no repetir llamadas). null si no existe */
const getTagId = async (name, { deadline } = {}) => {
  const cached = tagIdCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  const { status, data } = await request('GET', `/accounts/tags/name/${encodeURIComponent(name)}`, { deadline });
  if (status === 404 || !data?.id) return null;
  tagIdCache.set(name, { id: data.id, expiresAt: Date.now() + TAG_CACHE_TTL_MS });
  return data.id;
};

// --- Contactos -------------------------------------------------------------------------------------------------

/** "Ana María Pérez" -> { first_name: "Ana", last_name: "María Pérez" } */
const splitName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const first = (parts.shift() || '').slice(0, MAX_NAME_CHARS);
  const last = parts.join(' ').slice(0, MAX_NAME_CHARS);
  return last ? { first_name: first, last_name: last } : { first_name: first };
};

/**
 * Busca el contacto por su teléfono (el id es el teléfono con código de país):
 *  - si existe, le agrega las etiquetas;
 *  - si no existe, lo crea con sus datos y las etiquetas.
 * Devuelve solo { status, reason, created, tagsApplied, tagsFailed }: nunca datos del cliente ni respuestas crudas.
 * status: 'synced' | 'partial' (alguna etiqueta falló) | 'skipped' (sin token / sin teléfono) | 'failed'.
 */
const syncContact = async ({ name, phone, tags = [], deadline } = {}) => {
  if (!isEnabled()) return { status: 'skipped', reason: 'disabled' };

  const id = normalizePhone(phone);
  if (!id) return { status: 'skipped', reason: phone ? 'invalid_phone' : 'no_phone' };

  const tagNames = [...new Set(tags.map((t) => String(t || '').trim()).filter(Boolean))];

  try {
    const lookup = await request('GET', `/contacts/${id}`, { deadline });

    if (lookup.status === 404) {
      const body = { phone: `+${id}`, ...splitName(name) };
      if (tagNames.length) body.actions = tagNames.map((tag_name) => ({ action: 'add_tag', tag_name }));
      await request('POST', '/contacts', { json: body, deadline });
      return { status: 'synced', reason: 'created', created: true, tagsApplied: tagNames.length, tagsFailed: 0 };
    }

    let applied = 0;
    let failed = 0;
    let failReason = null;
    await Promise.all(tagNames.map(async (tagName) => {
      try {
        const tagId = await getTagId(tagName, { deadline });
        if (!tagId) { failed++; failReason = failReason || 'tag_missing'; return; }
        await request('POST', `/contacts/${id}/tags/${tagId}`, { deadline });
        applied++;
      } catch (err) {
        failed++;
        failReason = failReason || err.kind || 'error';
      }
    }));

    if (failed === 0) return { status: 'synced', reason: 'tagged', created: false, tagsApplied: applied, tagsFailed: 0 };
    return {
      status: applied > 0 ? 'partial' : 'failed',
      reason: failReason,
      created: false,
      tagsApplied: applied,
      tagsFailed: failed
    };
  } catch (err) {
    const kind = err instanceof ChatraceError ? err.kind : 'error';
    logWarn('chatrace_sync_failed', { kind, status: err?.status });
    return { status: 'failed', reason: kind };
  }
};

/** Solo para pruebas */
const _resetCaches = () => tagIdCache.clear();

module.exports = {
  isEnabled,
  normalizePhone,
  splitName,
  listTags,
  createTag,
  getTagId,
  syncContact,
  ChatraceError,
  _resetCaches
};
