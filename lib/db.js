'use strict';
/**
 * Suivi Brazza — couche d'accès à la base SQLite (better-sqlite3).
 * Une seule instance partagée par le serveur Next ; la base est créée et
 * initialisée automatiquement au premier appel si elle est vierge.
 *
 * Multi-utilisateurs : le catalogue des plateformes est commun (`platforms`),
 * mais le statut / les notes / les gains de chacun vivent dans `user_platforms`.
 */
const Database = require('better-sqlite3');
const path = require('node:path');
const crypto = require('node:crypto');
const { P_STATUSES, A_STATUSES, CONGO_STATUSES, ensureReady, copyLegacyStateToUser } = require('./schema.js');

const DB_PATH = process.env.SUIVI_DB || path.join(process.cwd(), 'data', 'suivi-brazza.db');

let _db = null;
function db() {
  if (_db) return _db;
  const fs = require('node:fs');
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 3000');
  ensureReady(_db);
  return _db;
}

/* ---------- Codes d'accès ---------- */
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

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** Code lisible du type « ABCD-2345 » (sans caractères ambigus). */
function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s.slice(0, 4) + '-' + s.slice(4);
}

/* ---------- Utilisateurs ---------- */
const publicUser = (u) => (u ? { id: u.id, name: u.name, role: u.role, created_at: u.created_at } : null);

function countUsers() {
  return db().prepare('SELECT COUNT(*) AS c FROM users').get().c;
}
function listUsers() {
  return db().prepare('SELECT id, name, role, created_at FROM users ORDER BY role DESC, name COLLATE NOCASE').all();
}
function getUser(id) {
  return publicUser(db().prepare('SELECT * FROM users WHERE id = ?').get(id));
}
function getUserByName(name) {
  return db().prepare('SELECT * FROM users WHERE lower(name) = lower(?)').get(String(name).trim());
}
function createUser({ name, code, role = 'member' }) {
  const clean = String(name || '').trim();
  if (clean.length < 2) throw new Error('Nom trop court (2 caractères minimum)');
  if (getUserByName(clean)) throw new Error('Ce nom est déjà pris');
  const accessCode = code ? String(code) : randomCode();
  if (accessCode.length < 4) throw new Error('Code trop court (4 caractères minimum)');
  const id = 'u-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  db().prepare('INSERT INTO users (id, name, code, role) VALUES (?, ?, ?, ?)')
    .run(id, clean, hashCode(accessCode), role);
  return { user: getUser(id), code: accessCode };
}
function updateUser(id, fields) {
  const sets = [], vals = [];
  if (typeof fields.name === 'string' && fields.name.trim()) {
    const clean = fields.name.trim();
    if (clean.length < 2) throw new Error('Nom trop court (2 caractères minimum)');
    const other = getUserByName(clean);
    if (other && other.id !== id) throw new Error('Ce nom est déjà pris');
    sets.push('name = ?'); vals.push(clean);
  }
  let newCode = null;
  if (fields.code) {
    const code = String(fields.code);
    if (code.length < 4) throw new Error('Code trop court (4 caractères minimum)');
    sets.push('code = ?'); vals.push(hashCode(code));
    newCode = code;
  } else if (fields.resetCode) {
    newCode = randomCode();
    sets.push('code = ?'); vals.push(hashCode(newCode));
  }
  if (fields.role === 'admin' || fields.role === 'member') {
    sets.push('role = ?'); vals.push(fields.role);
  }
  if (!sets.length) return { user: getUser(id), code: null };
  vals.push(id);
  db().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  // Un nouveau code invalide les sessions ouvertes avec l'ancien.
  if (newCode) db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  return { user: getUser(id), code: newCode };
}
function deleteUser(id) {
  const tx = db().transaction(() => {
    db().prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db().prepare('DELETE FROM user_platforms WHERE user_id = ?').run(id);
    db().prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  tx();
}
function login(name, code) {
  const u = getUserByName(name);
  if (!u || !verifyCode(code, u.code)) return null;
  return publicUser(u);
}

/* ---------- Premier lancement ---------- */
function setupAdmin({ name, code }) {
  const conn = db();
  if (countUsers() > 0) throw new Error('La configuration a déjà été faite');
  const tx = conn.transaction(() => {
    const { user } = createUser({ name, code, role: 'admin' });
    copyLegacyStateToUser(conn, user.id); // récupère le tableau existant
    return user;
  });
  return tx();
}

/* ---------- Sessions ---------- */
function createSession(userId) {
  const token = newToken();
  db().prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}
function userByToken(token) {
  if (!token) return null;
  db().prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-30 days')").run();
  const row = db().prepare(`
    SELECT u.id, u.name, u.role, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
  return row || null;
}
function deleteSession(token) {
  db().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/* ---------- Plateformes : catalogue commun ---------- */
const PLATFORM_STATE_FIELDS = ['status', 'unote', 'gain'];
const PLATFORM_CATALOG_FIELDS = ['name', 'url', 'cat', 'note', 'congo', 'position'];

/** Liste fusionnée : catalogue + état personnel de l'utilisateur.
 *  `all: true` ignore les restrictions (tableau de l'admin). */
function listPlatforms(userId, { all = false } = {}) {
  if (!userId) return db().prepare('SELECT * FROM platforms ORDER BY position, id').all();
  return db().prepare(`
    SELECT p.id, p.name, p.url, p.login_url, p.cat, p.note, p.congo, p.position,
           COALESCE(up.status, 'pas_inscrit') AS status,
           COALESCE(up.unote, '') AS unote,
           COALESCE(up.gain, '') AS gain,
           COALESCE(up.allowed, 1) AS allowed,
           COALESCE(up.updated_at, p.updated_at) AS updated_at
    FROM platforms p
    LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = ?
    WHERE (? = 1 OR COALESCE(up.allowed, 1) = 1)
    ORDER BY p.position, p.id
  `).all(userId, all ? 1 : 0);
}

/** Un membre a-t-il le droit de voir/travailler sur cette plateforme ? */
function platformAllowed(userId, platformId) {
  const row = db().prepare('SELECT allowed FROM user_platforms WHERE user_id = ? AND platform_id = ?')
    .get(userId, platformId);
  return !row || row.allowed === 1;
}

/** Remplace la liste des sites autorisés d'un membre (admin).
 *  Les états existants sont conservés : masquer ne supprime rien. */
function setUserPlatforms(userId, platformIds) {
  const conn = db();
  const ids = Array.isArray(platformIds) ? [...new Set(platformIds.map(String))] : [];
  conn.transaction(() => {
    conn.prepare(`INSERT OR IGNORE INTO user_platforms (user_id, platform_id, status, allowed)
                  SELECT ?, id, 'pas_inscrit', 0 FROM platforms`).run(userId);
    conn.prepare('UPDATE user_platforms SET allowed = 0 WHERE user_id = ?').run(userId);
    const upd = conn.prepare('UPDATE user_platforms SET allowed = 1 WHERE user_id = ? AND platform_id = ?');
    for (const id of ids) upd.run(userId, id);
  })();
  return {
    allowed: conn.prepare('SELECT COUNT(*) AS c FROM user_platforms WHERE user_id = ? AND allowed = 1').get(userId).c,
    total: conn.prepare('SELECT COUNT(*) AS c FROM platforms').get().c
  };
}

/** Toutes les plateformes + autorisation, pour l'écran « Sites » de l'admin. */
function listPlatformAccess(userId) {
  return db().prepare(`
    SELECT p.id, p.name, p.cat, p.congo, p.position,
           COALESCE(up.allowed, 1) AS allowed
    FROM platforms p
    LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = ?
    ORDER BY p.position, p.id
  `).all(userId);
}

/** Met à jour le statut / les notes / les gains d'une personne. */
function updateUserPlatform(userId, platformId, fields) {
  const sets = [], vals = [];
  for (const k of PLATFORM_STATE_FIELDS) {
    if (!(k in fields)) continue;
    if (k === 'status' && !P_STATUSES.includes(fields[k])) throw new Error('Statut invalide');
    sets.push(k + ' = ?'); vals.push(String(fields[k]));
  }
  if (!sets.length) return null;
  const current = db().prepare('SELECT status, unote, gain FROM user_platforms WHERE user_id = ? AND platform_id = ?')
    .get(userId, platformId);
  if (!current) {
    const defaults = { status: 'pas_inscrit', unote: '', gain: '', ...Object.fromEntries(
      PLATFORM_STATE_FIELDS.filter(k => k in fields).map(k => [k, String(fields[k])])
    ) };
    db().prepare(`INSERT INTO user_platforms (user_id, platform_id, status, unote, gain)
                  VALUES (?, ?, ?, ?, ?)`).run(userId, platformId, defaults.status, defaults.unote, defaults.gain);
    return { changes: 1 };
  }
  vals.push(userId, platformId);
  return db().prepare(`UPDATE user_platforms SET ${sets.join(', ')}, updated_at = datetime('now')
                       WHERE user_id = ? AND platform_id = ?`).run(...vals);
}

/** Champs communs (nom, URL, catégorie, note officielle, Congo) — admin. */
function updatePlatformCatalog(id, fields) {
  const sets = [], vals = [];
  for (const k of PLATFORM_CATALOG_FIELDS) {
    if (!(k in fields)) continue;
    if (k === 'congo' && !CONGO_STATUSES.includes(fields[k])) throw new Error('Statut Congo invalide');
    sets.push(k + ' = ?'); vals.push(String(fields[k]));
  }
  if (!sets.length) return null;
  vals.push(id);
  return db().prepare(`UPDATE platforms SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
}

function createPlatform({ name, url = '', cat = 'ia', note = '', congo, status = 'pas_inscrit', userId }) {
  const id = 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const max = db().prepare('SELECT COALESCE(MAX(position), -1) AS m FROM platforms').get().m + 1;
  const cg = CONGO_STATUSES.includes(congo) ? congo : (cat === 'bloquees' ? 'non' : 'ok');
  const st = P_STATUSES.includes(status) ? status : 'pas_inscrit';
  db().prepare('INSERT INTO platforms (id, name, url, cat, note, status, congo, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, String(name), String(url), String(cat), String(note), 'pas_inscrit', cg, max);
  // Les membres restreints ne voient pas automatiquement les nouvelles plateformes.
  if (userId) {
    db().prepare(`INSERT OR IGNORE INTO user_platforms (user_id, platform_id, status, allowed)
                  SELECT DISTINCT up.user_id, ?, 'pas_inscrit', 0 FROM user_platforms up
                  WHERE up.allowed = 0 AND up.user_id != ?`).run(id, userId);
  }
  if (userId) {
    db().prepare('INSERT INTO user_platforms (user_id, platform_id, status, allowed) VALUES (?, ?, ?, 1)')
      .run(userId, id, st);
  }
  return listPlatforms(userId, { all: true }).find(p => p.id === id) || db().prepare('SELECT * FROM platforms WHERE id = ?').get(id);
}
function deletePlatform(id) {
  const tx = db().transaction(() => {
    db().prepare('DELETE FROM user_platforms WHERE platform_id = ?').run(id);
    db().prepare('DELETE FROM accounts WHERE platform_id = ?').run(id);
    db().prepare('DELETE FROM platforms WHERE id = ?').run(id);
  });
  tx();
}

/* ---------- Actions (plan d'équipe, commun) ---------- */
function listActions() {
  return db().prepare('SELECT * FROM actions ORDER BY position, id').all();
}
function updateAction(id, fields) {
  const allowed = ['phase', 'title', 'detail', 'status', 'unote', 'position'];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (k in fields) {
      if (k === 'status' && !A_STATUSES.includes(fields[k])) throw new Error('Statut invalide');
      sets.push(k + ' = ?'); vals.push(String(fields[k]));
    }
  }
  if (!sets.length) return null;
  vals.push(id);
  return db().prepare(`UPDATE actions SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
}
function createAction({ phase = 'p1', title, detail = '' }) {
  const id = 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const max = db().prepare('SELECT COALESCE(MAX(position), -1) AS m FROM actions').get().m + 1;
  db().prepare('INSERT INTO actions (id, phase, title, detail, status, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, String(phase), String(title), String(detail), 'a_faire', max);
  return db().prepare('SELECT * FROM actions WHERE id = ?').get(id);
}
function deleteAction(id) {
  return db().prepare('DELETE FROM actions WHERE id = ?').run(id);
}

/* ---------- Statistiques ---------- */
function getStats(userId, { all = false } = {}) {
  const conn = db();
  const stats = Object.fromEntries(P_STATUSES.map(s => [s, 0]));
  let rows;
  if (userId) {
    rows = conn.prepare(`
      SELECT COALESCE(up.status, 'pas_inscrit') AS status, COUNT(*) AS c
      FROM platforms p
      LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = ?
      WHERE p.cat != 'bloquees' AND (? = 1 OR COALESCE(up.allowed, 1) = 1)
      GROUP BY 1
    `).all(userId, all ? 1 : 0);
  } else {
    rows = conn.prepare('SELECT status, COUNT(*) AS c FROM platforms WHERE cat != ? GROUP BY status').all('bloquees');
  }
  rows.forEach(r => { stats[r.status] = r.c; });
  stats.total = userId
    ? conn.prepare(`SELECT COUNT(*) AS c FROM platforms p
                    LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = ?
                    WHERE p.cat != 'bloquees' AND (? = 1 OR COALESCE(up.allowed, 1) = 1)`)
        .get(userId, all ? 1 : 0).c
    : conn.prepare('SELECT COUNT(*) AS c FROM platforms WHERE cat != ?').get('bloquees').c;
  const gainRow = userId
    ? conn.prepare(`SELECT COALESCE(SUM(CAST(up.gain AS REAL)), 0) AS g
                    FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
                    WHERE up.user_id = ? AND p.cat != 'bloquees' AND up.gain != ''
                      AND (? = 1 OR up.allowed = 1)`).get(userId, all ? 1 : 0)
    : conn.prepare("SELECT COALESCE(SUM(CAST(gain AS REAL)), 0) AS g FROM platforms WHERE cat != ? AND gain != ''").get('bloquees');
  stats.gain = gainRow.g;
  return stats;
}

/** Résumé d'avancement de chaque personne, pour le tableau de bord admin. */
function listUserSummaries() {
  const conn = db();
  const totals = conn.prepare(`
    SELECT up.user_id,
           MAX(up.updated_at) AS last_update,
           COUNT(*) AS tracked
    FROM user_platforms up JOIN platforms p ON p.id = up.platform_id
    WHERE p.cat != 'bloquees' AND COALESCE(up.allowed, 1) = 1
      AND (up.status != 'pas_inscrit' OR up.unote != '' OR up.gain != '')
    GROUP BY up.user_id
  `).all();
  const byUser = new Map(totals.map(t => [t.user_id, t]));
  const activeTotal = conn.prepare("SELECT COUNT(*) AS c FROM platforms WHERE cat != 'bloquees'").get().c;
  const allowedFor = conn.prepare(`
    SELECT COUNT(*) AS c FROM platforms p
    LEFT JOIN user_platforms up ON up.platform_id = p.id AND up.user_id = ?
    WHERE p.cat != 'bloquees' AND COALESCE(up.allowed, 1) = 1
  `);
  return listUsers().map(u => {
    const extra = byUser.get(u.id) || {};
    const admin = u.role === 'admin';
    return {
      ...u,
      stats: getStats(u.id, { all: admin }),
      last_update: extra.last_update || null,
      tracked: extra.tracked || 0,
      allowed_count: admin ? activeTotal : allowedFor.get(u.id).c,
      total_count: activeTotal
    };
  });
}

/* ---------- Divers ---------- */
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
function takeSnapshot() {
  const fs = require('node:fs');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = `suivi-brazza-${stamp}.json`;
  const dump = {
    exportedAt: new Date().toISOString(),
    users: db().prepare('SELECT id, name, role, created_at FROM users').all(),
    platforms: db().prepare('SELECT * FROM platforms').all(),
    user_platforms: db().prepare('SELECT * FROM user_platforms').all(),
    actions: db().prepare('SELECT * FROM actions').all()
  };
  fs.writeFileSync(path.join(BACKUP_DIR, file), JSON.stringify(dump, null, 2));
  db().prepare('INSERT INTO snapshots (file) VALUES (?)').run(file);
  // rotation : garder les 40 plus récents
  const olds = db().prepare('SELECT id, file FROM snapshots ORDER BY id DESC LIMIT -1 OFFSET 40').all();
  for (const o of olds) {
    db().prepare('DELETE FROM snapshots WHERE id = ?').run(o.id);
    try { fs.unlinkSync(path.join(BACKUP_DIR, o.file)); } catch {}
  }
  return file;
}

function lastSnapshot() {
  const r = db().prepare('SELECT file, created_at FROM snapshots ORDER BY id DESC LIMIT 1').get();
  return r || null;
}

module.exports = {
  db, DB_PATH,
  P_STATUSES, A_STATUSES, CONGO_STATUSES,
  // utilisateurs
  countUsers, listUsers, getUser, getUserByName, createUser, updateUser, deleteUser,
  login, setupAdmin, verifyCode, randomCode,
  // sessions
  createSession, userByToken, deleteSession,
  // plateformes
  listPlatforms, updateUserPlatform, updatePlatformCatalog, createPlatform, deletePlatform,
  platformAllowed, setUserPlatforms, listPlatformAccess,
  // actions
  listActions, updateAction, createAction, deleteAction,
  // stats
  getStats, listUserSummaries,
  takeSnapshot, lastSnapshot
};
