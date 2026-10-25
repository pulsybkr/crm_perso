# 🇨🇬 Suivi Brazza — Next.js + SQLite

Application de suivi des plateformes de travail en ligne et du plan d'action pour l'équipe de Brazzaville.
Next.js 16 (React) + better-sqlite3. Chaque modification est écrite directement dans la base
`data/suivi-brazza.db` + un snapshot JSON automatique dans `data/backups/` (40 conservés).

## Démarrage

```bash
npm run dev          # développement → http://localhost:3000
# ou :
npm run build && npm start   # production
```

La base est créée et initialisée automatiquement au premier lancement (46 plateformes + 22 actions du dossier).

## Commandes utiles

```bash
node scripts/init-db.js --reset  # SAUVEGARDE puis réinitialise avec les données du dossier
npm run db:snapshot / db:check   # snapshot manuel / statistiques
node scripts/check-db.js   # statistiques rapides de la base
```

## Structure

- `app/page.jsx` — interface React (plateformes, plan d'action, règles d'or)
- `app/api/platforms/route.js` — CRUD plateformes (GET/POST/PATCH/DELETE)
- `app/api/actions/route.js` — CRUD actions
- `app/api/snapshot/route.js` — déclenche un snapshot (appelé à chaque sauvegarde)
- `app/api/stats/route.js` — statistiques
- `lib/db.js` — couche d'accès SQLite (better-sqlite3, WAL)
- `data/suivi-brazza.db` — LA base de données
- `data/backups/*.json` — snapshots automatiques (rotation 40)
- `suivi-brazza.html` + `suivi-brazza.js` — ancienne version autonome (localStorage), conservée en secours

## Reste à faire plus tard
- [ ] Historique des gains mensuels (table `earnings`)
- [ ] Multi-utilisateurs (un compte par membre de l'équipe)
- [ ] Déploiement VPS
