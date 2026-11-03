'use strict';
/** Supprime les sessions expirées (> 30 jours). */
require('dotenv').config({ path: '.env.local', quiet: true });
const { purgeExpiredSessions, pool } = require('../lib/db.js');
(async () => {
  console.log(`${await purgeExpiredSessions()} session(s) expirée(s) supprimée(s).`);
  await pool().end();
})().catch(e => { console.error('Purge impossible :', e.message); process.exit(1); });
