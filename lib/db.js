'use strict';
const { Pool } = require('pg');
const crypto = require('node:crypto');

const P_STATUSES = ['pas_inscrit', 'en_cours', 'sans_missions', 'in_review', 'avec_missions', 'abandonne'];
const A_STATUSES = ['a_faire', 'en_cours', 'fait'];
const CONGO_STATUSES = ['ok', 'verifier', 'non'];
const ROLES = ['admin', 'member'];

const MIN_CODE_LENGTH = 6;

let _pool = null;
function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL est absent');
  _pool = new Pool({ connectionString: url, max: 5 });
  return _pool;
}
async function q(text, params) { return pool().query(text, params); }
async function tx(fn) {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/* Écrit « maintenant » au format texte historique (YYYY-MM-DD HH:MM:SS, UTC),
   identique au DEFAULT des colonnes : une seule source de vérité. */
const NOW = "(to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))";

class DbError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
const invalid = (msg) => new DbError(msg, 422);

/* Convertit une valeur texte de date en instant comparable (NULL si illisible). */
const TS = (col) => `to_timestamp(${col}, 'YYYY-MM-DD HH24:MI:SS')`;

/** Identifiant lisible, sans collision (8 octets aléatoires). */
function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

/* ---------- gains : une seule normalisation pour le serveur ET pour le client ---------- */
/** Renvoie une chaîne « 12.50 » (point décimal) ou '' — lève une 422 si non numérique. */
function normalizeGain(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim().replace(/\s|€/g, '').replace(',', '.');
  if (raw === '') return '';
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw invalid('Gain invalide (nombre attendu, ex : 12,50)');
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw invalid('Gain hors limites');
  return String(n);
}

/* ---------- codes d'accès ---------- */
function hashCode(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(code), salt, 32).toString('hex');
  return `s1:${salt}:${hash}`;
}
function verifyCode(code, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [version, salt, hash] = stored.split(':');
  if (version !== 's1' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(code), salt, 32);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}
async function verifyUserCode(userCodeHash, code) {
  // exécute scrypt même quand l'utilisateur n'existe pas (temps de réponse constant)
  if (!userCodeHash) { crypto.scryptSync(String(code || ''), 'dummy-salt', 32); return false; }
  return verifyCode(code, userCodeHash);
}
function newToken() { return crypto.randomBytes(32).toString('hex'); }
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}
const publicUser = (u) => (u ? { id: u.id, name: u.name, role: u.role, created_at: u.created_at } : null);

/* ================= Utilisateurs ================= */

async function countUsers() {
  const r = await q('SELECT COUNT(*)::int AS c FROM users');
  return r.rows[0].c;
}
async function listUsers() {
  const r = await q('SELECT id, name, role, created_at FROM users ORDER BY role DESC, name');
  return r.rows;
}
async function getUser(id) {
  const r = await q('SELECT * FROM users WHERE id = $1', [id]);
  return publicUser(r.rows[0]);
}
async function getUserByName(name) {
  const r = await q('SELECT * FROM users WHERE lower(name) = lower($1)', [String(name).trim()]);
  return r.rows[0];
}
async function createUser({ name, code, role = 'member' }) {
  const clean = String(name || '').trim();
  if (clean.length < 2) throw invalid('Nom trop court (2 caractères minimum)');
  if (clean.length > 40) throw invalid('Nom trop long (40 caractères maximum)');
  if (!ROLES.includes(role)) throw invalid('Rôle invalide');
  if (await getUserByName(clean)) throw new DbError('Ce nom est déjà pris', 409);
  const accessCode = code ? String(code) : randomCode();
  if (accessCode.length < MIN_CODE_LENGTH) throw invalid(`Code trop court (${MIN_CODE_LENGTH} caractères minimum)`);
  const id = newId('u');
  await q('INSERT INTO users (id, name, code, role) VALUES ($1, $2, $3, $4)', [id, clean, hashCode(accessCode), role]);
  return { user: await getUser(id), code: accessCode };
}
async function updateUser(id, fields) {
  const sets = [], vals = [];
  let idx = 1;
  if (typeof fields.name === 'string' && fields.name.trim()) {
    const clean = fields.name.trim();
    if (clean.length < 2) throw invalid('Nom trop court (2 caractères minimum)');
    if (clean.length > 40) throw invalid('Nom trop long (40 caractères maximum)');
    const other = await getUserByName(clean);
    if (other && other.id !== id) throw new DbError('Ce nom est déjà pris', 409);
    sets.push(`name = $${idx++}`); vals.push(clean);
  }
  let newCode = null;
  if (fields.code) {
    const code = String(fields.code);
    if (code.length < MIN_CODE_LENGTH) throw invalid(`Code trop court (${MIN_CODE_LENGTH} caractères minimum)`);
    sets.push(`code = $${idx++}`); vals.push(hashCode(code));
    newCode = code;
  } else if (fields.resetCode) {
    newCode = randomCode();
    sets.push(`code = $${idx++}`); vals.push(hashCode(newCode));
  }
  if (fields.role === 'admin' || fields.role === 'member') {
    sets.push(`role = $${idx++}`); vals.push(fields.role);
  }
  if (!sets.length) return { user: await getUser(id), code: null };
  vals.push(id);
  const r = await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
  if (r.rowCount === 0) throw new DbError('utilisateur introuvable', 404);
  if (newCode) {
    // On invalide les autres sessions mais pas celle qui est en train de changer son code.
    if (fields.keepSession) await q('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [id, fields.keepSession]);
    else await q('DELETE FROM sessions WHERE user_id = $1', [id]);
  }
  return { user: await getUser(id), code: newCode };
}
async function deleteUser(id) {
  await tx(async (c) => {
    const owned = await c.query(
      'SELECT DISTINCT platform_id FROM user_platforms WHERE user_id = $1 AND allowed = 1', [id]);
    // Le coffre est rattaché aux plateformes (glossaire partagé) : on ne détruit pas les
    // secrets d'une plateforme qui reste suivie par quelqu'un d'autre.
    for (const row of owned.rows) {
      const others = await c.query(
        'SELECT 1 FROM user_platforms WHERE platform_id = $1 AND user_id <> $2 AND allowed = 1 LIMIT 1', [row.platform_id, id]);
      if (!others.rowCount) await c.query('DELETE FROM accounts WHERE platform_id = $1', [row.platform_id]);
    }
    await c.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await c.query('DELETE FROM user_platforms WHERE user_id = $1', [id]);
    await c.query('DELETE FROM users WHERE id = $1', [id]);
  });
}
/** Comptes encore reliés (directement ou non) à l'utilisateur, pour informer l'UI. */
async function countUserAccounts(userId) {
  const r = await q(`SELECT COUNT(DISTINCT a.id)::int AS c FROM accounts a
    JOIN user_platforms up ON up.platform_id = a.platform_id
    WHERE up.user_id = $1 AND up.allowed = 1`, [userId]);
  return r.rows[0].c;
}
async function login(name, code) {
  const u = await getUserByName(name);
  const ok = await verifyUserCode(u && u.code, code);
  if (!u || !ok) return null;
  return publicUser(u);
}
async function setupAdmin({ name, code }) {
  if (await countUsers() > 0) throw new DbError('La configuration a déjà été faite', 409);
  const { user } = await createUser({ name, code, role: 'admin' });
  return user;
}

/* ================= Sessions ================= */

async function createSession(userId) {
  const token = newToken();
  await q('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}
async function userByToken(token) {
  if (!token) return null;
  const r = await q(`
    SELECT u.id, u.name, u.role, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = $1 AND ${TS('s.created_at')} > NOW() - INTERVAL '30 days'
  `, [token]);
  return r.rows[0] || null;
}
async function deleteSession(token) {
  await q('DELETE FROM sessions WHERE token = $1', [token]);
}
/** Purge des sessions expirées — appelée par le script utilitaire, pas à chaque requête. */
async function purgeExpiredSessions() {
  const r = await q(`DELETE FROM sessions WHERE ${TS('created_at')} < NOW() - INTERVAL '30 days'`);
  return r.rowCount;
}

/* ================= Rate limiting (anti brute force) =================
   Compteur en mémoire, par instance. Suffisant pour un déploiement mono-instance ;
   la table `meta` reste la source persistante pour un déploiement multi-instances. */
const buckets = new Map();
function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) { buckets.set(key, { count: 1, reset: now + windowMs }); return { ok: true, left: limit - 1 }; }
  b.count += 1;
  if (b.count > limit) return { ok: false, left: 0, retryAfterMs: b.reset - now };
  return { ok: true, left: limit - b.count };
}
function rateReset(key) { buckets.delete(key); }

/* ================= Plateformes ================= */

const PLATFORM_STATE_FIELDS = ['status', 'unote', 'gain'];
const PLATFORM_CATALOG_FIELDS = ['name', 'url', 'cat', 'note', 'congo', 'position'];

async function listPlatforms(userId, { all = false } = {}) {
  if (!userId) {
    const r = await q('SELECT * FROM platforms ORDER BY position, id');
    return r.rows;
  }
  const r = await q(`
    SELECT p.id, p.name, p.url, p.login_url, p.cat, p.note, p.congo, p.position,
           COALESCE(up.status, 'pas_inscrit') AS status,
           COALESCE(up.unote, '') AS unote,
           COALESCE(up.gain, '') AS gain,
           COALESCE(up.allowed, 1) AS allowed,
           COALESCE(up.updated_at, p.updated_at) AS updated_at
    FROM platforms p
    LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
    WHERE ($2 = 1 OR COALESCE(up.allowed, 1) = 1)
    ORDER BY p.position, p.id
  `, [userId, all ? 1 : 0]);
  return r.rows;
}
async function platformExists(platformId) {
  const r = await q('SELECT 1 FROM platforms WHERE id = $1', [platformId]);
  return r.rowCount === 1;
}
/** Autorisée = une ligne user_platforms explicite avec allowed = 1. */
async function platformAllowed(userId, platformId) {
  const r = await q('SELECT allowed FROM user_platforms WHERE user_id = $1 AND platform_id = $2', [userId, platformId]);
  const row = r.rows[0];
  return !!row && row.allowed === 1;
}
async function setUserPlatforms(userId, platformIds) {
  const ids = Array.isArray(platformIds) ? [...new Set(platformIds.map(String))] : [];
  const rows = (await q('SELECT id FROM platforms')).rows.map(r => r.id);
  const known = new Set(rows);
  const unknown = ids.filter(id => !known.has(id));
  if (unknown.length) throw invalid(`Plateforme(s) inconnue(s) : ${unknown.slice(0, 3).join(', ')}`);
  await tx(async (c) => {
    await c.query(`INSERT INTO user_platforms (user_id, platform_id, status, allowed)
      SELECT $1, id, 'pas_inscrit', 0 FROM platforms
      ON CONFLICT (user_id, platform_id) DO NOTHING`, [userId]);
    await c.query('UPDATE user_platforms SET allowed = 0 WHERE user_id = $1', [userId]);
    await c.query('UPDATE user_platforms SET allowed = 1 WHERE user_id = $1 AND platform_id = ANY($2::text[])', [userId, ids]);
  });
  const allowed = (await q('SELECT COUNT(*)::int AS c FROM user_platforms WHERE user_id = $1 AND allowed = 1', [userId])).rows[0].c;
  const total = (await q('SELECT COUNT(*)::int AS c FROM platforms')).rows[0].c;
  return { allowed, total };
}
async function listPlatformAccess(userId) {
  const r = await q(`
    SELECT p.id, p.name, p.cat, p.congo, p.position,
           COALESCE(up.allowed, 1) AS allowed
    FROM platforms p
    LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
    ORDER BY p.position, p.id
  `, [userId]);
  return r.rows;
}
async function updateUserPlatform(userId, platformId, fields) {
  if (!(await platformExists(platformId))) throw new DbError('Plateforme introuvable', 404);
  const sets = [], vals = [];
  let idx = 1;
  for (const k of PLATFORM_STATE_FIELDS) {
    if (!(k in fields)) continue;
    if (k === 'status') {
      if (!P_STATUSES.includes(String(fields[k]))) throw invalid('Statut invalide');
      sets.push(`status = $${idx++}`); vals.push(String(fields[k]));
    } else if (k === 'gain') {
      sets.push(`gain = $${idx++}`); vals.push(normalizeGain(fields[k]));
    } else {
      sets.push(`unote = $${idx++}`); vals.push(String(fields[k] ?? ''));
    }
  }
  if (!sets.length) throw invalid('aucun champ modifiable');
  vals.push(userId, platformId);
  const r = await q(`
    INSERT INTO user_platforms (user_id, platform_id, status, unote, gain, allowed)
    VALUES ($1, $2, 'pas_inscrit', '', '', 1)
    ON CONFLICT (user_id, platform_id) DO NOTHING`, [userId, platformId]);
  const u = await q(`UPDATE user_platforms SET ${sets.join(', ')}, updated_at = ${NOW}
    WHERE user_id = $${idx} AND platform_id = $${idx + 1}`, vals);
  return { changes: u.rowCount, created: r.rowCount };
}
async function updatePlatformCatalog(id, fields) {
  if (!(await platformExists(id))) throw new DbError('Plateforme introuvable', 404);
  const sets = [], vals = [];
  let idx = 1;
  for (const k of PLATFORM_CATALOG_FIELDS) {
    if (!(k in fields)) continue;
    if (k === 'name') {
      const name = String(fields.name ?? '').trim();
      if (!name) throw invalid('Nom requis');
      if (name.length > 120) throw invalid('Nom trop long (120 caractères maximum)');
      sets.push(`name = $${idx++}`); vals.push(name);
    } else if (k === 'congo') {
      if (!CONGO_STATUSES.includes(String(fields.congo))) throw invalid('Statut Congo invalide');
      sets.push(`congo = $${idx++}`); vals.push(String(fields.congo));
    } else if (k === 'position') {
      const n = Number(fields.position);
      if (!Number.isFinite(n)) throw invalid('Position invalide');
      sets.push(`position = $${idx++}`); vals.push(Math.trunc(n));
    } else {
      sets.push(`${k} = $${idx++}`); vals.push(String(fields[k] ?? ''));
    }
  }
  if (!sets.length) throw invalid('aucun champ modifiable');
  vals.push(id);
  const r = await q(`UPDATE platforms SET ${sets.join(', ')}, updated_at = ${NOW} WHERE id = $${idx}`, vals);
  if (r.rowCount === 0) throw new DbError('Plateforme introuvable', 404);
  return { changes: r.rowCount };
}
async function createPlatform({ name, url = '', cat = 'ia', note = '', congo, status = 'pas_inscrit', userId }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw invalid('name requis');
  if (cleanName.length > 120) throw invalid('Nom trop long (120 caractères maximum)');
  const cleanCat = String(cat || 'ia');
  const cleanStatus = P_STATUSES.includes(String(status)) ? String(status) : 'pas_inscrit';
  const cg = CONGO_STATUSES.includes(congo) ? congo : (cleanCat === 'bloquees' ? 'non' : 'ok');
  const id = newId('p');
  await tx(async (c) => {
    const max = (await c.query('SELECT COALESCE(MAX(position), -1) AS m FROM platforms')).rows[0].m + 1;
    await c.query(`INSERT INTO platforms (id, name, url, cat, note, status, congo, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, cleanName, String(url || ''), cleanCat, String(note || ''), cleanStatus, cg, max]);
    if (userId) {
      await c.query(`INSERT INTO user_platforms (user_id, platform_id, status, allowed)
        SELECT DISTINCT up.user_id, $1, 'pas_inscrit', 0 FROM user_platforms up
        WHERE up.allowed = 0 AND up.user_id <> $2
        ON CONFLICT (user_id, platform_id) DO NOTHING`, [id, userId]);
      await c.query('INSERT INTO user_platforms (user_id, platform_id, status, allowed) VALUES ($1, $2, $3, 1)',
        [userId, id, cleanStatus]);
    }
  });
  return (await listPlatforms(userId, { all: true })).find(p => p.id === id)
    || (await q('SELECT * FROM platforms WHERE id = $1', [id])).rows[0];
}
async function deletePlatform(id) {
  const r = await tx(async (c) => {
    await c.query('DELETE FROM accounts WHERE platform_id = $1', [id]);
    await c.query('DELETE FROM user_platforms WHERE platform_id = $1', [id]);
    return c.query('DELETE FROM platforms WHERE id = $1', [id]);
  });
  if (r.rowCount === 0) throw new DbError('Plateforme introuvable', 404);
}

/* ================= Actions ================= */

async function listActions() {
  const r = await q('SELECT * FROM actions ORDER BY position, id');
  return r.rows;
}
async function updateAction(id, fields) {
  const allowed = ['phase', 'title', 'detail', 'status', 'unote', 'position'];
  const sets = [], vals = [];
  let idx = 1;
  for (const k of allowed) {
    if (!(k in fields)) continue;
    if (k === 'status' && !A_STATUSES.includes(fields[k])) throw invalid('Statut invalide');
    if (k === 'title') {
      const t = String(fields.title ?? '').trim();
      if (!t) throw invalid('Titre requis');
      sets.push(`title = $${idx++}`); vals.push(t);
    } else {
      sets.push(`${k} = $${idx++}`); vals.push(String(fields[k] ?? ''));
    }
  }
  if (!sets.length) throw invalid('aucun champ modifiable');
  vals.push(id);
  const r = await q(`UPDATE actions SET ${sets.join(', ')}, updated_at = ${NOW} WHERE id = $${idx}`, vals);
  if (r.rowCount === 0) throw new DbError('action introuvable', 404);
  return { changes: r.rowCount };
}
async function createAction({ phase = 'p1', title, detail = '' }) {
  const clean = String(title || '').trim();
  if (!clean) throw invalid('title requis');
  const id = newId('a');
  const max = (await q('SELECT COALESCE(MAX(position), -1) AS m FROM actions')).rows[0].m + 1;
  await q('INSERT INTO actions (id, phase, title, detail, status, position) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, String(phase || 'p1'), clean, String(detail ?? ''), 'a_faire', max]);
  return (await q('SELECT * FROM actions WHERE id = $1', [id])).rows[0];
}
async function deleteAction(id) {
  const r = await q('DELETE FROM actions WHERE id = $1', [id]);
  return { changes: r.rowCount };
}

/* ================= Statistiques ================= */

async function getStats(userId, { all = false } = {}) {
  const stats = Object.fromEntries(P_STATUSES.map(s => [s, 0]));
  let rows;
  if (userId) {
    const r = await q(`
      SELECT COALESCE(up.status, 'pas_inscrit') AS status, COUNT(*)::int AS c
      FROM platforms p
      LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
      WHERE p.cat <> 'bloquees' AND ($2 = 1 OR COALESCE(up.allowed, 1) = 1)
      GROUP BY 1
    `, [userId, all ? 1 : 0]);
    rows = r.rows;
  } else {
    const r = await q("SELECT status, COUNT(*)::int AS c FROM platforms WHERE cat <> 'bloquees' GROUP BY status");
    rows = r.rows;
  }
  rows.forEach(r => { stats[r.status] = r.c; });
  if (userId) {
    const tr = await q(`SELECT COUNT(*)::int AS c FROM platforms p
      LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
      WHERE p.cat <> 'bloquees' AND ($2 = 1 OR COALESCE(up.allowed, 1) = 1)`, [userId, all ? 1 : 0]);
    stats.total = tr.rows[0].c;
    const gr = await q(`SELECT COALESCE(SUM(CAST(NULLIF(trim(up.gain), '') AS NUMERIC)), 0) AS g
      FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
      WHERE up.user_id = $1 AND p.cat <> 'bloquees'
        AND up.gain ~ '^-?[0-9]+(\\.[0-9]+)?$'
        AND ($2 = 1 OR up.allowed = 1)`, [userId, all ? 1 : 0]);
    stats.gain = Number(gr.rows[0].g);
  } else {
    const tr = await q("SELECT COUNT(*)::int AS c FROM platforms WHERE cat <> 'bloquees'");
    stats.total = tr.rows[0].c;
    const gr = await q(`SELECT COALESCE(SUM(CAST(NULLIF(trim(gain), '') AS NUMERIC)), 0) AS g
      FROM platforms WHERE cat <> 'bloquees' AND gain ~ '^-?[0-9]+(\\.[0-9]+)?$'`);
    stats.gain = Number(gr.rows[0].g);
  }
  return stats;
}

/** Résumé d'équipe sans N+1 : une requête de comptage + une de gains. */
async function listUserSummaries() {
  const activeTotal = (await q("SELECT COUNT(*)::int AS c FROM platforms WHERE cat <> 'bloquees'")).rows[0].c;
  const users = await listUsers();
  const perUserStatus = new Map();
  const statusRows = (await q(`
    SELECT up.user_id, COALESCE(up.status, 'pas_inscrit') AS status, COUNT(*)::int AS c,
           MAX(${TS('up.updated_at')}) AS last_update,
           COUNT(*) FILTER (WHERE up.status <> 'pas_inscrit' OR COALESCE(up.unote, '') <> '' OR COALESCE(up.gain, '') <> '')::int AS tracked,
           COUNT(*)::int AS allowed_count
    FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
    WHERE p.cat <> 'bloquees' AND up.allowed = 1
    GROUP BY up.user_id, COALESCE(up.status, 'pas_inscrit')
  `)).rows;
  const gains = new Map((await q(`
    SELECT up.user_id, COALESCE(SUM(CAST(NULLIF(trim(up.gain), '') AS NUMERIC)), 0) AS g
    FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
    WHERE p.cat <> 'bloquees' AND up.allowed = 1 AND up.gain ~ '^-?[0-9]+(\\.[0-9]+)?$'
    GROUP BY up.user_id
  `)).rows.map(r => [r.user_id, Number(r.g)]));

  for (const row of statusRows) {
    const acc = perUserStatus.get(row.user_id) || {
      stats: Object.fromEntries(P_STATUSES.map(s => [s, 0])), total: 0, last_update: null, tracked: 0
    };
    acc.stats[row.status] = (acc.stats[row.status] || 0) + row.c;
    acc.stats.total += row.c;
    acc.total += row.c;
    acc.tracked += row.tracked;
    if (row.last_update && (!acc.last_update || row.last_update > acc.last_update)) acc.last_update = row.last_update;
    perUserStatus.set(row.user_id, acc);
  }

  return users.map(u => {
    const admin = u.role === 'admin';
    const acc = perUserStatus.get(u.id) || {
      stats: Object.fromEntries(P_STATUSES.map(s => [s, 0])), total: 0, last_update: null, tracked: 0
    };
    const stats = { ...acc.stats, gain: gains.get(u.id) || 0 };
    // un admin voit toujours tout le catalogue actif
    if (admin) stats.total = activeTotal;
    return {
      ...u,
      stats,
      last_update: acc.last_update ? new Date(acc.last_update).toISOString() : null,
      tracked: acc.tracked || 0,
      allowed_count: admin ? activeTotal : (acc.total || 0),
      total_count: activeTotal
    };
  });
}

/* ================= Snapshots (en base, pas sur disque) ================= */

const SNAPSHOT_KEEP = 40;

async function takeSnapshot({ userId = null } = {}) {
  const dump = {
    exportedAt: new Date().toISOString(),
    users: (await q('SELECT id, name, role, created_at FROM users')).rows,
    platforms: (await q('SELECT * FROM platforms')).rows,
    user_platforms: (await q('SELECT * FROM user_platforms')).rows,
    actions: (await q('SELECT * FROM actions')).rows
  };
  const payload = JSON.stringify(dump);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = `suivi-brazza-${stamp}-${crypto.randomBytes(3).toString('hex')}.json`;
  // Le dump est conservé en base (le disque d'un serveur serverless est éphémère).
  await q('INSERT INTO snapshots (file, data, created_by) VALUES ($1, $2, $3)', [file, payload, userId]);
  await tx(async (c) => {
    await c.query(`DELETE FROM snapshots WHERE id NOT IN
      (SELECT id FROM snapshots ORDER BY id DESC LIMIT $1)`, [SNAPSHOT_KEEP]);
  });
  return file;
}
async function lastSnapshot() {
  const r = await q('SELECT id, file, created_at FROM snapshots ORDER BY id DESC LIMIT 1');
  return r.rows[0] || null;
}
async function getSnapshot(id) {
  const r = await q('SELECT id, file, created_at, data FROM snapshots WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function listSnapshots(limit = 20) {
  const r = await q('SELECT id, file, created_at FROM snapshots ORDER BY id DESC LIMIT $1', [limit]);
  return r.rows;
}

module.exports = {
  pool, q, NOW,
  DB_PATH: process.env.SUIVI_DB || require('node:path').join(process.cwd(), 'data', 'suivi-brazza.db'),
  P_STATUSES, A_STATUSES, CONGO_STATUSES, MIN_CODE_LENGTH,
  DbError, newId, normalizeGain,
  countUsers, listUsers, getUser, getUserByName, createUser, updateUser, deleteUser, countUserAccounts,
  login, setupAdmin, verifyCode, randomCode,
  createSession, userByToken, deleteSession, purgeExpiredSessions,
  rateLimit, rateReset,
  listPlatforms, updateUserPlatform, updatePlatformCatalog, createPlatform, deletePlatform,
  platformAllowed, platformExists, setUserPlatforms, listPlatformAccess,
  listActions, updateAction, createAction, deleteAction,
  getStats, listUserSummaries,
  takeSnapshot, lastSnapshot, getSnapshot, listSnapshots
};
