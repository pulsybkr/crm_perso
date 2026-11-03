'use strict';
/** Statistiques rapides de la base. */
require('dotenv').config({ path: '.env.local', quiet: true });
const { listPlatforms, listActions, getStats, lastSnapshot, listUsers, listUserSummaries, DB_PATH, pool } = require('../lib/db.js');
(async () => {
  const ps = await listPlatforms(), as = await listActions(), st = await getStats();
  console.log(`DB: ${DB_PATH}`);
  console.log(`${ps.length} plateformes (${ps.filter(p => p.cat === 'bloquees').length} bloquées exclues des stats), ${as.length} actions.`);
  console.log('Statuts (tableau historique):', Object.fromEntries(Object.entries(st).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => [k, v])));
  const congo = ps.filter(p => p.cat !== 'bloquees').reduce((a, p) => ((a[p.congo] = (a[p.congo] || 0) + 1), a), {});
  console.log('Congo (plateformes actives):', congo);
  const users = await listUsers();
  console.log(`Utilisateurs: ${users.length || 'aucun (premier lancement — écran de création du compte admin)'}`);
  for (const u of await listUserSummaries()) {
    const s = Object.fromEntries(Object.entries(u.stats).filter(([k, v]) => typeof v === 'number' && v > 0 && k !== 'total'));
    console.log(`  - ${u.name} [${u.role}] · ${u.tracked} suivie(s) · ${s ? JSON.stringify(s) : '{}'}`);
  }
  console.log(`Actions: ${as.filter(a => a.status === 'fait').length} faites / ${as.filter(a => a.status === 'en_cours').length} en cours / ${as.filter(a => a.status === 'a_faire').length} à faire`);
  const last = await lastSnapshot();
  if (last) console.log(`Dernier snapshot: ${last.file} (${last.created_at})`);
  await pool().end();
})().catch(e => { console.error('Lecture impossible :', e.message); process.exit(1); });
