'use strict';
const d = require('../lib/db.js');
const users = d.listUsers();
const admin = users.find(u => u.role === 'admin') || users[0];
const rows = admin ? d.listPlatforms(admin.id, { all: true }) : d.listPlatforms();
const active = rows.filter(p => p.cat !== 'bloquees');
console.log('Utilisateur de référence :', admin ? admin.name : '(aucun — catalogue seul)');
console.log('Actives :', active.length);
for (const p of active) {
  console.log([p.status, p.congo, p.cat, p.name, p.gain || '-', (p.unote || '').slice(0, 60)].join(' | '));
}
