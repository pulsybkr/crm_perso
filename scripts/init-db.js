'use strict';
/**
 * Réinitialise la base avec les données du dossier (lib/schema.js).
 *   node scripts/init-db.js            → initialise si vierge (comme au 1er lancement)
 *   node scripts/init-db.js --reset    → SAUVEGARDE puis écrase tout avec les données d'origine
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ensureReady, seedAll, markSeeded } = require('../lib/schema.js');

const DB_PATH = process.env.SUIVI_DB || path.join(process.cwd(), 'data', 'suivi-brazza.db');
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const RESET = process.argv.includes('--reset');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

if (RESET) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = path.join(BACKUP_DIR, `suivi-brazza-${stamp}.json`);
  const dump = {
    exportedAt: new Date().toISOString(),
    platforms: db.prepare('SELECT * FROM platforms').all(),
    actions: db.prepare('SELECT * FROM actions').all()
  };
  fs.writeFileSync(file, JSON.stringify(dump, null, 2));
  console.log(`Sauvegarde écrite : ${file}`);
  db.exec('DELETE FROM platforms; DELETE FROM actions; DELETE FROM snapshots;');
  db.prepare("DELETE FROM meta WHERE key = 'seeded'").run();
}

const seeded = ensureReady(db);
console.log(seeded
  ? `Base initialisée (${DB_PATH}) : ${db.prepare('SELECT COUNT(*) c FROM platforms').get().c} plateformes, ${db.prepare('SELECT COUNT(*) c FROM actions').get().c} actions.`
  : `Base déjà peuplée (${DB_PATH}) — rien à faire (utilisez --reset pour repartir des données d'origine).`);
db.close();
