'use strict';
/** Écrit un snapshot JSON de la base (stocké dans la table `snapshots`, rotation 40). */
require('dotenv').config({ path: '.env.local', quiet: true });
const { takeSnapshot, lastSnapshot, purgeExpiredSessions } = require('../lib/db.js');
(async () => {
  const purged = await purgeExpiredSessions();
  if (purged) console.log(`${purged} session(s) expirée(s) purgée(s).`);
  console.log('Snapshot écrit :', await takeSnapshot());
  const last = await lastSnapshot();
  if (last) console.log('Dernier snapshot :', last.file, last.created_at);
  process.exit(0);
})().catch(e => { console.error('Snapshot impossible :', e.message); process.exit(1); });
