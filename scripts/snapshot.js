'use strict';
/** Écrit un snapshot JSON de la base (data/backups/). */
const { takeSnapshot } = require('../lib/db.js');
console.log('Snapshot écrit :', takeSnapshot());
