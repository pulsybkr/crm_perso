'use strict';
/**
 * Vérification complète de l'intégrité de la base Neon.
 *   node scripts/verify.js
 * Code de sortie 1 si au moins un contrôle échoue.
 */
require('dotenv').config({ path: '.env.local', quiet: true });

const { Pool } = require('pg');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

const P_STATUSES = ['pas_inscrit', 'en_cours', 'sans_missions', 'in_review', 'avec_missions', 'abandonne'];
const A_STATUSES = ['a_faire', 'en_cours', 'fait'];
const CONGO_STATUSES = ['ok', 'verifier', 'non'];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est absent.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const q = async (text, params) => (await pool.query(text, params)).rows;

  /* ---- 1. contraintes ---- */
  const constraints = await q("SELECT conname, contype FROM pg_constraint WHERE connamespace = 'public'::regnamespace");
  const fks = constraints.filter(c => c.contype === 'f').map(c => c.conname).sort();
  const expectedFk = ['accounts_platform_id_fkey', 'sessions_user_id_fkey', 'user_platforms_platform_id_fkey', 'user_platforms_user_id_fkey'];
  check('Clés étrangères présentes', expectedFk.every(f => fks.includes(f)), fks.join(', ') || 'aucune');
  check('Contraintes CHECK de statut', constraints.filter(c => c.contype === 'c').length >= 4,
    constraints.filter(c => c.contype === 'c').map(c => c.conname).join(', '));

  /* ---- 2. orphelins ---- */
  const orphans = {};
  orphans.user_platforms_user = (await q('SELECT COUNT(*)::int c FROM user_platforms up LEFT JOIN users u ON u.id = up.user_id WHERE u.id IS NULL'))[0].c;
  orphans.user_platforms_platform = (await q('SELECT COUNT(*)::int c FROM user_platforms up LEFT JOIN platforms p ON p.id = up.platform_id WHERE p.id IS NULL'))[0].c;
  orphans.sessions_user = (await q('SELECT COUNT(*)::int c FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE u.id IS NULL'))[0].c;
  orphans.accounts_platform = (await q('SELECT COUNT(*)::int c FROM accounts a LEFT JOIN platforms p ON p.id = a.platform_id WHERE p.id IS NULL'))[0].c;
  const orphanTotal = Object.values(orphans).reduce((a, b) => a + b, 0);
  check('Aucune ligne orpheline', orphanTotal === 0, JSON.stringify(orphans));

  /* ---- 3. cohérence des énumérations ---- */
  const badP = (await q(`SELECT COUNT(*)::int c FROM platforms WHERE status <> ALL($1::text[]) OR congo <> ALL($2::text[])`,
    [P_STATUSES, CONGO_STATUSES]))[0].c;
  check('Statuts plateforme dans l\'énumération', badP === 0, `${badP} ligne(s) hors énumération`);
  const badA = (await q('SELECT COUNT(*)::int c FROM actions WHERE status <> ALL($1::text[])', [A_STATUSES]))[0].c;
  check('Statuts action dans l\'énumération', badA === 0, `${badA} ligne(s)`);
  const badRole = (await q("SELECT COUNT(*)::int c FROM users WHERE role NOT IN ('admin','member')"))[0].c;
  check('Rôles valides', badRole === 0, `${badRole} ligne(s)`);

  /* ---- 4. gains : format unique (point décimal) ---- */
  const badGainsUp = (await q(`SELECT COUNT(*)::int c FROM user_platforms WHERE COALESCE(gain,'') <> '' AND gain !~ '^-?[0-9]+(\\.[0-9]+)?$'`))[0].c;
  const badGainsP = (await q(`SELECT COUNT(*)::int c FROM platforms WHERE COALESCE(gain,'') <> '' AND gain !~ '^-?[0-9]+(\\.[0-9]+)?$'`))[0].c;
  check('Gains numériques normalisés', badGainsUp + badGainsP === 0, `user_platforms=${badGainsUp}, platforms=${badGainsP}`);

  /* ---- 5. codes d'accès : format scrypt et longueur ---- */
  const badCodes = (await q(`SELECT COUNT(*)::int c FROM users WHERE code !~ '^s1:[0-9a-f]+:[0-9a-f]+$'`))[0].c;
  check('Codes hachés (scrypt)', badCodes === 0, `${badCodes} code(s) non hachés`);

  /* ---- 6. timestamps lisibles ---- */
  const badTs = (await q(`SELECT COUNT(*)::int c FROM platforms WHERE updated_at IS NOT NULL AND to_timestamp(updated_at, 'YYYY-MM-DD HH24:MI:SS') IS NULL`))[0].c;
  const badTsS = (await q(`SELECT COUNT(*)::int c FROM sessions WHERE to_timestamp(created_at, 'YYYY-MM-DD HH24:MI:SS') IS NULL`))[0].c;
  check('Horodatages parsables', badTs + badTsS === 0, `platforms=${badTs}, sessions=${badTsS}`);

  /* ---- 7. accès : chaque membre a bien ses lignes ---- */
  const usersNoRows = (await q(`SELECT u.name FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_platforms up WHERE up.user_id = u.id)`)).length > 0;
  check('Chaque utilisateur a des lignes d\'accès', !usersNoRows, usersNoRows ? 'utilisateur(s) sans ligne : ' + (await q(`SELECT u.name FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_platforms up WHERE up.user_id = u.id)`)).map(r => r.name).join(', ') : '');

  /* ---- 8. coffre ---- */
  const verifier = (await q("SELECT value FROM meta WHERE key = 'cred_verifier'"))[0];
  const salt = (await q("SELECT value FROM meta WHERE key = 'cred_salt'"))[0];
  const accounts = (await q(`SELECT COUNT(*)::int c FROM accounts`))[0].c;
  check('Coffre cohérent (sel + vérificateur ensemble)', (!verifier && !salt) || (verifier && salt),
    `verifier=${!!verifier}, salt=${!!salt}, comptes=${accounts}`);
  const badSecrets = (await q(`SELECT COUNT(*)::int c FROM accounts WHERE secret <> '' AND secret NOT LIKE '%.%.%'`))[0].c;
  check('Secrets au format iv.tag.ct', badSecrets === 0, `${badSecrets} secret(s) mal formés`);

  /* ---- 9. colonnes de snapshot ---- */
  const cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name = 'snapshots'")).map(r => r.column_name);
  check('Table snapshots contient `data`', cols.includes('data'), cols.join(','));

  /* ---- 10. sessions expirées ---- */
  const expired = (await q("SELECT COUNT(*)::int c FROM sessions WHERE to_timestamp(created_at, 'YYYY-MM-DD HH24:MI:SS') < NOW() - INTERVAL '30 days'"))[0].c;
  check('Aucune session expirée résiduelle', expired === 0, `${expired} session(s) — purger avec npm run db:purge`);

  await pool.end();

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? '✔' : '✘'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} contrôles réussis.`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error('Vérification impossible :', e.message); process.exit(1); });
