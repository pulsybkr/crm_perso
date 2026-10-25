'use strict';
/**
 * Suivi Brazza — couche d'accès à la base SQLite (better-sqlite3).
 * Une seule instance partagée par le serveur Next ; la base est créée et
 * initialisée automatiquement au premier appel si elle est vierge.
 */
const Database = require('better-sqlite3');
const path = require('node:path');
const { P_STATUSES, A_STATUSES, ensureReady } = require('./schema.js');

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

/* ---------- Plateformes ---------- */
function listPlatforms() {
  return db().prepare('SELECT * FROM platforms ORDER BY position, id').all();
}
function updatePlatform(id, fields) {
  const allowed = ['name', 'url', 'cat', 'note', 'status', 'unote', 'gain', 'position'];
  const sets = [], vals = [];
  for (const k of allowed) {
    if (k in fields) {
      if (k === 'status' && !P_STATUSES.includes(fields[k])) throw new Error('Statut invalide');
      sets.push(k + ' = ?'); vals.push(String(fields[k]));
    }
  }
  if (!sets.length) return null;
  vals.push(id);
  return db().prepare(`UPDATE platforms SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
}
function createPlatform({ name, url = '', cat = 'ia', note = '' }) {
  const id = 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const max = db().prepare('SELECT COALESCE(MAX(position), -1) AS m FROM platforms').get().m + 1;
  db().prepare('INSERT INTO platforms (id, name, url, cat, note, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, String(name), String(url), String(cat), String(note), 'pas_inscrit', max);
  return db().prepare('SELECT * FROM platforms WHERE id = ?').get(id);
}
function deletePlatform(id) {
  return db().prepare('DELETE FROM platforms WHERE id = ?').run(id);
}

/* ---------- Actions ---------- */
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

/* ---------- Divers ---------- */
function getStats() {
  const rows = db().prepare('SELECT status, COUNT(*) AS c FROM platforms WHERE cat != ? GROUP BY status')
    .all('bloquees');
  const stats = Object.fromEntries(P_STATUSES.map(s => [s, 0]));
  rows.forEach(r => { stats[r.status] = r.c; });
  stats.total = db().prepare('SELECT COUNT(*) AS c FROM platforms WHERE cat != ?').get('bloquees').c;
  stats.gain = db().prepare("SELECT COALESCE(SUM(CAST(gain AS REAL)), 0) AS g FROM platforms WHERE cat != ? AND gain != ''")
    .get('bloquees').g;
  return stats;
}

const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
function takeSnapshot() {
  const fs = require('node:fs');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = `suivi-brazza-${stamp}.json`;
  const dump = {
    exportedAt: new Date().toISOString(),
    platforms: db().prepare('SELECT * FROM platforms').all(),
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
  P_STATUSES, A_STATUSES,
  listPlatforms, updatePlatform, createPlatform, deletePlatform,
  listActions, updateAction, createAction, deleteAction,
  getStats, takeSnapshot, lastSnapshot
};
