'use strict';

// Connexion partagée par instance serveur, initialisée uniquement au besoin.
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');

let connection;
function neonDb() {
  if (!connection) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est absent');
    connection = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));
  }
  return connection;
}

module.exports = { neonDb };
