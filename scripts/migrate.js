'use strict';
/**
 * Migration idempotente du schéma Neon.
 *   node scripts/migrate.js          → applique ce qui manque
 *   node scripts/migrate.js --check  → teste uniquement les connexions (aucune écriture)
 *
 * 1. Clés étrangères manquantes (les orphelins éventuels sont supprimés avant).
 * 2. Table `snapshots` : colonnes `data` (contenu du snapshot) et `created_by`.
 * 3. Index de performances.
 */
require('dotenv').config({ path: '.env.local', quiet: true });

const { Pool } = require('pg');

const CHECK_ONLY = process.argv.includes('--check');

const FK = [
  ['user_platforms', 'user_id', 'users', 'id', 'cascade'],
  ['user_platforms', 'platform_id', 'platforms', 'id', 'cascade'],
  ['sessions', 'user_id', 'users', 'id', 'cascade'],
  ['accounts', 'platform_id', 'platforms', 'id', 'cascade']
];

const STEPS = [
  /* --- nettoyage des orphelins (les contraintes échoueraient sinon) --- */
  `DELETE FROM user_platforms WHERE user_id NOT IN (SELECT id FROM users)`,
  `DELETE FROM user_platforms WHERE platform_id NOT IN (SELECT id FROM platforms)`,
  `DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)`,
  `DELETE FROM accounts WHERE platform_id NOT IN (SELECT id FROM platforms)`,
  /* --- snapshots conservés en base (disque éphémère en production) --- */
  `ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS data text`,
  `ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS created_by text`,
  /* --- index --- */
  `CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts (platform_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_platforms_position ON platforms (position)`,
  `CREATE INDEX IF NOT EXISTS idx_actions_position ON actions (position)`,
  `CREATE INDEX IF NOT EXISTS idx_user_platforms_platform ON user_platforms (platform_id)`
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est absent.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('suivi-brazza-migrate'))");
    if (CHECK_ONLY) {
      const v = await client.query('SELECT version()');
      console.log('Connexion Neon OK —', v.rows[0].version.split(',')[0]);
      return;
    }
    await client.query('BEGIN');
    for (const sql of STEPS) await client.query(sql);

    /* contraintes ajoutées seulement si elles n'existent pas déjà */
    const existing = new Set((await client.query(
      "SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace"
    )).rows.map(r => r.conname));
    for (const [table, column, target, refColumn, onDelete] of FK) {
      const name = `${table}_${column}_fkey`;
      if (existing.has(name)) { console.log(`= ${name} déjà présent`); continue; }
      await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name}
        FOREIGN KEY (${column}) REFERENCES ${target} (${refColumn}) ON DELETE ${onDelete.toUpperCase()}`);
      console.log(`+ ${name}`);
    }
    await client.query('COMMIT');
    console.log('Migration appliquée ✔');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('suivi-brazza-migrate'))").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Migration échouée :', e.message); process.exit(1); });
