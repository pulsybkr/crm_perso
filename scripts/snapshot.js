'use strict';
/** Écrit un snapshot JSON de la base (data/backups/). */
require('dotenv').config({ path: '.env.local', quiet: true });
const { takeSnapshot } = require('../lib/db.js');
(async () => {
  console.log('Snapshot écrit :', await takeSnapshot());
})();
