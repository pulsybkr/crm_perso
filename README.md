# 🇨🇬 Suivi Brazza — Next.js + PostgreSQL (Neon)

Application de suivi des plateformes de travail en ligne et du plan d'action pour l'équipe de Brazzaville.
Next.js 16 (React) + **PostgreSQL (Neon)** via `DATABASE_URL`. Chaque modification est écrite
directement en base et un snapshot JSON est conservé dans la table `snapshots` (40 derniers).

## Démarrage

```bash
npm run dev          # développement → http://localhost:3000
# ou :
npm run build && npm start   # production
```

`.env.local` doit contenir `DATABASE_URL` (chaîne de connexion Neon). Pour durcir les cookies :
`COOKIE_SECURE=1` (déjà actif en production).

## Comptes & équipe

Au tout premier lancement, l'application demande de créer **ton compte administrateur**
(nom + code d'accès). Le tableau historique a été repris tel quel.

- Chaque personne a **son propre kanban** (statut, notes perso, gains par plateforme).
  Le catalogue des plateformes (nom, lien, catégorie, note officielle, éligibilité Congo) est commun.
- Onglet **👥 Équipe** (admin) : créer un membre, générer/réinitialiser son code,
  renommer, supprimer, et voir les compteurs d'avancement de chacun.
- **🌐 Sites** (admin) : choisir précisément les plateformes visibles/utilisables par
  chaque personne. Un site décoché disparaît de son kanban et devient inaccessible
  (même par API) ; ses notes, statuts et gains sont conservés si tu le réautorises.
  Toi, tu vois toujours tous les sites.
- **📋 Voir son kanban** ouvre le tableau d'un membre en **lecture seule**.
- **🔐 Coffre-fort** (admin) : identifiants des plateformes chiffrés en AES-256-GCM dérivé
  d'un mot de passe maître, **jamais stocké**. Le déverrouillage renvoie un jeton à durée
  de vie courte (5 min) : le maître ne circule pas à chaque requête.
- Les codes sont stockés **hachés (scrypt)** (6 caractères minimum) ; la session est un cookie
  `httpOnly` de 30 jours. Le login est limité à 8 tentatives / 10 min par IP et par nom.
- Un nouveau code n'invalide que les **autres** sessions : la session courante reste ouverte.

## Commandes utiles

```bash
npm run db:migrate   # applique les migrations de schéma (clés étrangères, colonnes de snapshot…)
npm run db:verify    # contrôle d'intégrité : FK, orphelins, énumérations, gains, horodatages, coffre
npm run db:check     # statistiques rapides
npm run db:snapshot  # écrit un snapshot manuel (en base)
npm run db:purge     # supprime les sessions de plus de 30 jours
```

`db:verify` sort en code 1 si un contrôle échoue : il peut servir de garde-fou avant déploiement.

## Structure

- `app/page.jsx` — interface React (plateformes, plan d'action, règles d'or, équipe)
- `app/components/Login.jsx` — création du compte admin / connexion
- `app/components/Team.jsx` — tableau de bord admin + gestion des membres
- `app/components/UserPlatformsModal.jsx` — choix des sites autorisés par membre
- `app/components/CredentialsModal.jsx` — coffre-fort des identifiants
- `app/api/auth/*/route.js` — setup, login, logout, session courante, changement de code
- `app/api/users/route.js` — gestion des membres (admin)
- `app/api/users/platforms/route.js` — liste d'accès / autorisations par membre (admin)
- `app/api/platforms/route.js` — lecture/écriture du tableau personnel (+ vue admin en lecture)
- `app/api/actions/route.js` — CRUD actions (lecture pour tous, écriture admin)
- `app/api/credentials/route.js` — coffre-fort (admin ; jeton de déverrouillage)
- `app/api/snapshot/route.js` — snapshot en base (1 / 30 s) + lecture du dernier
- `app/api/stats/route.js` — statistiques
- `lib/db.js` — couche d'accès PostgreSQL : pool, requêtes, comptes/sessions, rate limit, snapshots
- `lib/auth.js` — session cookie httpOnly, guards `requireUser` / `requireAdmin`
- `lib/crypto.js` — chiffrement du coffre (scrypt + AES-256-GCM)
- `scripts/migrate.js` — migrations idempotentes du schéma
- `scripts/verify.js` — contrôle d'intégrité complet
- `scripts/check-db.js` — statistiques rapides (catalogue + avancement par personne)
- `scripts/snapshot.js` / `scripts/purge-sessions.js` — maintenance
- `dossier-travail-en-ligne-brazzaville.md` — le dossier de recherche complet (oct. 2026)

## Modèle de données (simplifié)

`users` · `sessions` · `platforms` (catalogue commun) · `user_platforms` (kanban personnel, `allowed`)
· `actions` · `accounts` (coffre, secrets chiffrés) · `snapshots` · `meta`.
Les clés étrangères sont appliquées en base (`ON DELETE CASCADE` sur les lignes filles).

## Reste à faire plus tard
- [ ] Historique des gains mensuels (table `earnings`)
- [ ] Déploiement VPS
