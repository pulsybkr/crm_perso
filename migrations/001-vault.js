'use strict';
/** Migration légère : applique le schéma manquant sur une base existante. */
const { db } = require('../lib/db.js');
const { SCHEMA } = require('../lib/schema.js');
db().exec(SCHEMA);
console.log('Schéma appliqué (idempotent) : credentials prêt.');
