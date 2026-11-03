'use strict';
const { Pool } = require('pg');
const crypto = require('node:crypto');

const P_STATUSES = ['pas_inscrit', 'en_cours', 'sans_missions', 'in_review', 'avec_missions', 'abandonne'];
const A_STATUSES = ['a_faire', 'en_cours', 'fait'];
const CONGO_STATUSES = ['ok', 'verifier', 'non'];

let _pool = null;
function pool() {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL est absent');
  _pool = new Pool({ connectionString: url });
  return _pool;
}
async function q(text, params) { return pool().query(text, params); }

const nowSql = "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

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
function newToken() { return crypto.randomBytes(32).toString('hex'); }
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}
const publicUser = (u) => (u ? { id: u.id, name: u.name, role: u.role, created_at: u.created_at } : null);

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
  if (clean.length < 2) throw new Error('Nom trop court (2 caractères minimum)');
  if (await getUserByName(clean)) throw new Error('Ce nom est déjà pris');
  const accessCode = code ? String(code) : randomCode();
  if (accessCode.length < 4) throw new Error('Code trop court (4 caractères minimum)');
  const id = 'u-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  await q('INSERT INTO users (id, name, code, role) VALUES ($1, $2, $3, $4)', [id, clean, hashCode(accessCode), role]);
  return { user: await getUser(id), code: accessCode };
}
async function updateUser(id, fields) {
  const sets = [], vals = [];
  let idx = 1;
  if (typeof fields.name === 'string' && fields.name.trim()) {
    const clean = fields.name.trim();
    if (clean.length < 2) throw new Error('Nom trop court (2 caractères minimum)');
    const other = await getUserByName(clean);
    if (other && other.id !== id) throw new Error('Ce nom est déjà pris');
    sets.push(`name = $${idx++}`); vals.push(clean);
  }
  let newCode = null;
  if (fields.code) {
    const code = String(fields.code);
    if (code.length < 4) throw new Error('Code trop court (4 caractères minimum)');
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
  await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
  if (newCode) await q('DELETE FROM sessions WHERE user_id = $1', [id]);
  return { user: await getUser(id), code: newCode };
}
async function deleteUser(id) {
  await q('DELETE FROM sessions WHERE user_id = $1', [id]);
  await q('DELETE FROM user_platforms WHERE user_id = $1', [id]);
  await q('DELETE FROM users WHERE id = $1', [id]);
}
async function login(name, code) {
  const u = await getUserByName(name);
  if (!u || !verifyCode(code, u.code)) return null;
  return publicUser(u);
}
async function setupAdmin({ name, code }) {
  if (await countUsers() > 0) throw new Error('La configuration a déjà été faite');
  const { user } = await createUser({ name, code, role: 'admin' });
  // copy legacy state not applicable in neon (no legacy); noop
  return user;
}
async function createSession(userId) {
  const token = newToken();
  await q('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}
async function userByToken(token) {
  if (!token) return null;
  await q("DELETE FROM sessions WHERE created_at::timestamp < (NOW() - INTERVAL '30 days')");
  const r = await q(`
    SELECT u.id, u.name, u.role, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = $1
  `, [token]);
  return r.rows[0] || null;
}
async function deleteSession(token) {
  await q('DELETE FROM sessions WHERE token = $1', [token]);
}

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
async function platformAllowed(userId, platformId) {
  const r = await q('SELECT allowed FROM user_platforms WHERE user_id = $1 AND platform_id = $2', [userId, platformId]);
  const row = r.rows[0];
  return !row || row.allowed === 1;
}
async function setUserPlatforms(userId, platformIds) {
  const ids = Array.isArray(platformIds) ? [...new Set(platformIds.map(String))] : [];
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO user_platforms (user_id, platform_id, status, allowed)
      SELECT $1, id, 'pas_inscrit', 0 FROM platforms
      ON CONFLICT (user_id, platform_id) DO NOTHING`, [userId]);
    await client.query('UPDATE user_platforms SET allowed = 0 WHERE user_id = $1', [userId]);
    for (const id of ids) {
      await client.query('UPDATE user_platforms SET allowed = 1 WHERE user_id = $1 AND platform_id = $2', [userId, id]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
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
  const sets = [], vals = [];
  let idx = 1;
  for (const k of PLATFORM_STATE_FIELDS) {
    if (!(k in fields)) continue;
    if (k === 'status' && !P_STATUSES.includes(fields[k])) throw new Error('Statut invalide');
    sets.push(`${k} = $${idx++}`); vals.push(String(fields[k]));
  }
  if (!sets.length) return null;
  const cur = await q('SELECT status, unote, gain FROM user_platforms WHERE user_id = $1 AND platform_id = $2', [userId, platformId]);
  const current = cur.rows[0];
  if (!current) {
    const defaults = { status: 'pas_inscrit', unote: '', gain: '', ...Object.fromEntries(
      PLATFORM_STATE_FIELDS.filter(k => k in fields).map(k => [k, String(fields[k])])
    ) };
    await q(`INSERT INTO user_platforms (user_id, platform_id, status, unote, gain) VALUES ($1, $2, $3, $4, $5)`,
      [userId, platformId, defaults.status, defaults.unote, defaults.gain]);
    return { changes: 1 };
  }
  vals.push(userId, platformId);
  const r = await q(`UPDATE user_platforms SET ${sets.join(', ')}, updated_at = ${nowSql} WHERE user_id = $${idx} AND platform_id = $${idx+1}`, vals);
  return { changes: r.rowCount };
}
async function updatePlatformCatalog(id, fields) {
  const sets = [], vals = [];
  let idx = 1;
  for (const k of PLATFORM_CATALOG_FIELDS) {
    if (!(k in fields)) continue;
    if (k === 'congo' && !CONGO_STATUSES.includes(fields[k])) throw new Error('Statut Congo invalide');
    sets.push(`${k} = $${idx++}`); vals.push(String(fields[k]));
  }
  if (!sets.length) return null;
  vals.push(id);
  const r = await q(`UPDATE platforms SET ${sets.join(', ')}, updated_at = ${nowSql} WHERE id = $${idx}`, vals);
  return { changes: r.rowCount };
}
async function createPlatform({ name, url = '', cat = 'ia', note = '', congo, status = 'pas_inscrit', userId }) {
  const id = 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const max = (await q('SELECT COALESCE(MAX(position), -1) AS m FROM platforms')).rows[0].m + 1;
  const cg = CONGO_STATUSES.includes(congo) ? congo : (cat === 'bloquees' ? 'non' : 'ok');
  await q('INSERT INTO platforms (id, name, url, cat, note, status, congo, position) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, String(name), String(url), String(cat), String(note), 'pas_inscrit', cg, max]);
  if (userId) {
    await q(`INSERT INTO user_platforms (user_id, platform_id, status, allowed)
      SELECT DISTINCT up.user_id, $1, 'pas_inscrit', 0 FROM user_platforms up
      WHERE up.allowed = 0 AND up.user_id != $2
      ON CONFLICT (user_id, platform_id) DO NOTHING`, [id, userId]);
    await q('INSERT INTO user_platforms (user_id, platform_id, status, allowed) VALUES ($1, $2, $3, 1)', [userId, id, P_STATUSES.includes(status) ? status : 'pas_inscrit']);
  }
  const found = (await listPlatforms(userId, { all: true })).find(p => p.id === id);
  return found || (await q('SELECT * FROM platforms WHERE id = $1', [id])).rows[0];
}
async function deletePlatform(id) {
  await q('DELETE FROM user_platforms WHERE platform_id = $1', [id]);
  await q('DELETE FROM accounts WHERE platform_id = $1', [id]);
  await q('DELETE FROM platforms WHERE id = $1', [id]);
}

async function listActions() {
  const r = await q('SELECT * FROM actions ORDER BY position, id');
  return r.rows;
}
async function updateAction(id, fields) {
  const allowed = ['phase', 'title', 'detail', 'status', 'unote', 'position'];
  const sets = [], vals = [];
  let idx = 1;
  for (const k of allowed) {
    if (k in fields) {
      if (k === 'status' && !A_STATUSES.includes(fields[k])) throw new Error('Statut invalide');
      sets.push(`${k} = $${idx++}`); vals.push(String(fields[k]));
    }
  }
  if (!sets.length) return null;
  vals.push(id);
  const r = await q(`UPDATE actions SET ${sets.join(', ')}, updated_at = ${nowSql} WHERE id = $${idx}`, vals);
  return { changes: r.rowCount };
}
async function createAction({ phase = 'p1', title, detail = '' }) {
  const id = 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const max = (await q('SELECT COALESCE(MAX(position), -1) AS m FROM actions')).rows[0].m + 1;
  await q('INSERT INTO actions (id, phase, title, detail, status, position) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, String(phase), String(title), String(detail), 'a_faire', max]);
  const r = await q('SELECT * FROM actions WHERE id = $1', [id]);
  return r.rows[0];
}
async function deleteAction(id) {
  const r = await q('DELETE FROM actions WHERE id = $1', [id]);
  return { changes: r.rowCount };
}

async function getStats(userId, { all = false } = {}) {
  const stats = Object.fromEntries(P_STATUSES.map(s => [s, 0]));
  let rows;
  if (userId) {
    const r = await q(`
      SELECT COALESCE(up.status, 'pas_inscrit') AS status, COUNT(*)::int AS c
      FROM platforms p
      LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
      WHERE p.cat != 'bloquees' AND ($2 = 1 OR COALESCE(up.allowed, 1) = 1)
      GROUP BY 1
    `, [userId, all ? 1 : 0]);
    rows = r.rows;
  } else {
    const r = await q("SELECT status, COUNT(*)::int AS c FROM platforms WHERE cat != $1 GROUP BY status", ['bloquees']);
    rows = r.rows;
  }
  rows.forEach(r => { stats[r.status] = r.c; });
  if (userId) {
    const tr = await q(`SELECT COUNT(*)::int AS c FROM platforms p
      LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
      WHERE p.cat != 'bloquees' AND ($2 = 1 OR COALESCE(up.allowed, 1) = 1)`, [userId, all ? 1 : 0]);
    stats.total = tr.rows[0].c;
    const gr = await q(`SELECT COALESCE(SUM(CAST(up.gain AS REAL)), 0) AS g
      FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
      WHERE up.user_id = $1 AND p.cat != 'bloquees' AND up.gain != ''
        AND ($2 = 1 OR up.allowed = 1)`, [userId, all ? 1 : 0]);
    stats.gain = gr.rows[0].g;
  } else {
    const tr = await q("SELECT COUNT(*)::int AS c FROM platforms WHERE cat != $1", ['bloquees']);
    stats.total = tr.rows[0].c;
    const gr = await q("SELECT COALESCE(SUM(CAST(gain AS REAL)), 0) AS g FROM platforms WHERE cat != $1 AND gain != ''", ['bloquees']);
    stats.gain = gr.rows[0].g;
  }
  return stats;
}
async function listUserSummaries() {
  const totals = (await q(`
    SELECT up.user_id,
           MAX(up.updated_at) AS last_update,
           COUNT(*)::int AS tracked
    FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
    WHERE p.cat != 'bloquees' AND COALESCE(up.allowed, 1) = 1
      AND (up.status != 'pas_inscrit' OR up.unote != '' OR up.gain != '')
    GROUP BY up.user_id
  `)).rows;
  const byUser = new Map(totals.map(t => [t.user_id, t]));
  const activeTotal = (await q("SELECT COUNT(*)::int AS c FROM platforms WHERE cat != 'bloquees'")).rows[0].c;
  const users = await listUsers();
  const out = [];
  for (const u of users) {
    const extra = byUser.get(u.id) || {};
    const admin = u.role === 'admin';
    const stats = await getStats(u.id, { all: admin });
    let allowed_count;
    if (admin) allowed_count = activeTotal;
    else {
      const r = await q(`SELECT COUNT(*)::int AS c FROM platforms p
        LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = $1
        WHERE p.cat != 'bloquees' AND COALESCE(up.allowed, 1) = 1`, [u.id]);
      allowed_count = r.rows[0].c;
    }
    out.push({ ...u, stats, last_update: extra.last_update || null, tracked: extra.tracked || 0, allowed_count, total_count: activeTotal });
  }
  return out;
}

async function takeSnapshot() {
  const dump = {
    exportedAt: new Date().toISOString(),
    users: (await q('SELECT id, name, role, created_at FROM users')).rows,
    platforms: (await q('SELECT * FROM platforms')).rows,
    user_platforms: (await q('SELECT * FROM user_platforms')).rows,
    actions: (await q('SELECT * FROM actions')).rows
  };
  const fs = require('node:fs');
  const path = require('node:path');
  const DB_PATH = process.env.SUIVI_DB || path.join(process.cwd(), 'data', 'suivi-brazza.db');
  const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = `suivi-brazza-${stamp}.json`;
  fs.writeFileSync(path.join(BACKUP_DIR, file), JSON.stringify(dump, null, 2));
  await q('INSERT INTO snapshots (file) VALUES ($1)', [file]);
  const olds = (await q('SELECT id, file FROM snapshots ORDER BY id DESC LIMIT -1 OFFSET 40')).rows;
  for (const o of olds) {
    await q('DELETE FROM snapshots WHERE id = $1', [o.id]);
    try { fs.unlinkSync(path.join(BACKUP_DIR, o.file)); } catch {}
  }
  return file;
}
async function lastSnapshot() {
  const r = await q('SELECT file, created_at FROM snapshots ORDER BY id DESC LIMIT 1');
  return r.rows[0] || null;
}

module.exports = {
  pool, DB_PATH: process.env.SUIVI_DB || require('node:path').join(process.cwd(), 'data', 'suivi-brazza.db'),
  P_STATUSES, A_STATUSES, CONGO_STATUSES,
  countUsers, listUsers, getUser, getUserByName, createUser, updateUser, deleteUser,
  login, setupAdmin, verifyCode, randomCode,
  createSession, userByToken, deleteSession,
  listPlatforms, updateUserPlatform, updatePlatformCatalog, createPlatform, deletePlatform,
  platformAllowed, setUserPlatforms, listPlatformAccess,
  listActions, updateAction, createAction, deleteAction,
  getStats, listUserSummaries,
  takeSnapshot, lastSnapshot
};
