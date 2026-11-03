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

## Comptes & équipe

Au tout premier lancement, l'application demande de créer **ton compte administrateur**
(nom + code d'accès). Ton tableau actuel est repris tel quel : rien n'est perdu.

- Chaque personne a **son propre kanban** (statut, notes perso, gains par plateforme).
  Le catalogue des plateformes (nom, lien, catégorie, note officielle, éligibilité Congo) est commun.
- Onglet **👥 Équipe** (admin) : créer un membre, générer/réinitialiser son code,
  renommer, supprimer, et voir les compteurs d'avancement de chacun.
- **🌐 Sites** (admin) : choisir précisément les plateformes visibles/utilisables par
  chaque personne. Un site décoché disparaît de son kanban et devient inaccessible
  (même par API) ; ses notes, statuts et gains sont conservés si tu le réautorises.
  Toi, tu vois toujours tous les sites.
- **📋 Voir son kanban** ouvre le tableau d'un membre en **lecture seule**.
- Les codes sont stockés **hachés (scrypt)** ; la session est un cookie `httpOnly` de 30 jours.
- Un nouveau code invalide immédiatement les sessions ouvertes de ce membre.

Le code d'un nouveau membre n'est affiché **qu'une seule fois** à la création (ou après
réinitialisation) : note-le et transmets-le-lui.

## Commandes utiles

```bash
npm run db:reset    # SAUVEGARDE puis réinitialise avec les données du dossier
npm run db:snapshot  # écrit un snapshot JSON manuel
npm run db:check    # statistiques rapides
```

## Structure

- `app/page.jsx` — interface React (plateformes, plan d'action, règles d'or, équipe)
- `app/components/Login.jsx` — création du compte admin / connexion
- `app/components/Team.jsx` — tableau de bord admin + gestion des membres
- `app/components/UserPlatformsModal.jsx` — choix des sites autorisés par membre
- `app/api/auth/*/route.js` — setup, login, logout, session courante
- `app/api/users/route.js` — gestion des membres (admin)
- `app/api/users/platforms/route.js` — liste d'accès / autorisations par membre (admin)
- `app/api/platforms/route.js` — lecture/écriture du tableau personnel (+ vue admin en lecture)
- `app/api/actions/route.js` — CRUD actions (lecture pour tous, écriture admin)
- `app/api/snapshot/route.js` — écrit un snapshot (appelé à chaque sauvegarde) + GET dernier snapshot
- `app/api/stats/route.js` — statistiques
- `lib/db.js` — couche d'accès SQLite (better-sqlite3, WAL) + comptes/sessions
- `lib/auth.js` — session cookie httpOnly, guards `requireUser` / `requireAdmin`
- `lib/schema.js` — schéma + données initiales du dossier (partagé API/CLI)
- `scripts/init-db.js` — init / --reset (avec sauvegarde automatique avant reset)
- `scripts/check-db.js` — statistiques rapides (catalogue + avancement par personne)
- `scripts/snapshot.js` — snapshot JSON manuel
- `data/suivi-brazza.db` — LA base de données
- `data/backups/*.json` — snapshots automatiques (rotation 40)
- `suivi-brazza.html` + `suivi-brazza.js` — ancienne version autonome (localStorage), conservée en secours
- `dossier-travail-en-ligne-brazzaville.md` — le dossier de recherche complet (oct. 2026)

## Reste à faire plus tard
- [ ] Historique des gains mensuels (table `earnings`)
- [ ] Déploiement VPS
