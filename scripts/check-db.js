'use strict';
/** Statistiques rapides de la base. */
const { listPlatforms, listActions, getStats, lastSnapshot, DB_PATH } = require('../lib/db.js');
const ps = listPlatforms(), as = listActions(), st = getStats();
console.log(`DB: ${DB_PATH}`);
console.log(`${ps.length} plateformes (${ps.filter(p => p.cat === 'bloquees').length} bloquées exclues des stats), ${as.length} actions.`);
console.log('Statuts:', Object.fromEntries(Object.entries(st).filter(([, v]) => typeof v === 'number' && v > 0).map(([k, v]) => [k, v])));
console.log(`Actions: ${as.filter(a => a.status === 'fait').length} faites / ${as.filter(a => a.status === 'en_cours').length} en cours / ${as.filter(a => a.status === 'a_faire').length} à faire`);
const last = lastSnapshot();
if (last) console.log(`Dernier snapshot: ${last.file} (${last.created_at})`);
