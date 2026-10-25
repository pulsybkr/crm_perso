'use strict';
/**
 * Scripts partagés de gestion de la base suivi-brazza.db (node:sqlite).
 * - init-db.js     : crée les tables + insère les données du dossier si vide
 * - snapshot.js    : sauvegarde automatique rotative (data/backups/suivi-brazza-YYYYMMDD-HHmm.json)
 * - import-v1.js   : importe l'ancien localStorage (export JSON de suivi-brazza.html)
 */
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DB_PATH = process.env.SUIVI_DB || path.join(ROOT, 'data', 'suivi-brazza.db');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

/* ---------- Connexion + pragmas ---------- */
function openDb() {
  mkdirp(path.dirname(DB_PATH));
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 3000;');
  return db;
}

/* ---------- Schéma ---------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT DEFAULT '',
  cat TEXT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pas_inscrit'
    CHECK (status IN ('pas_inscrit','en_cours','sans_missions','avec_missions','pause','abandonne')),
  unote TEXT DEFAULT '',
  gain TEXT DEFAULT '',
  position INTEGER DEFAULT 999,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'a_faire' CHECK (status IN ('a_faire','en_cours','fait')),
  unote TEXT DEFAULT '',
  position INTEGER DEFAULT 999,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  file TEXT NOT NULL
);
`;

function ensureSchema(db) { db.exec(SCHEMA); }

/* ---------- Seed (données du dossier, octobre 2026) ---------- */
const P_STATUSES = ['pas_inscrit', 'en_cours', 'sans_missions', 'avec_missions', 'pause', 'abandonne'];
const CATS = ['ia', 'langues', 'agg', 'qa', 'etudes', 'micro', 'free', 'tuto', 'transc'];

function seedPlatforms() {
  return [
    // ——— IA & données ———
    ['p-mindrift', 'Mindrift (Toloka)', 'https://www.mindrift.com/', 'ia', '⭐ PRIORITÉ N°1 — ouvert au Congo (vérifié mai 2026) · 35–100 $/h · Payoneer 2×/mois · interdit : VPN', 'pas_inscrit'],
    ['p-crowdgen', 'CrowdGen (Appen)', 'https://crowdgen.com/', 'ia', '⭐ PRIORITÉ N°2 — rôles « Open to Africa » · projet FR ~22 $/h · s\'inscrire, remplir tous les profils de langue', 'pas_inscrit'],
    ['p-oneforma', 'OneForma (Centific)', 'https://www.oneforma.com/', 'ia', '5–20 $/session · paiements mensuels lents · filtrer les projets exigeant une présence physique (hors Congo)', 'pas_inscrit'],
    ['p-telus', 'TELUS Digital AI', 'https://www.telusinternational.ai/', 'ia', '4–18 $/h rôles rater · chercher les rôles « Open to Africa » / français africain · projets coupés mi-2026 : vérifier avant formation', 'pas_inscrit'],
    ['p-micro1', 'Micro1', 'https://www.micro1.io/', 'ia', '20–400 $/h selon rôle · entretien via leur IA · rôle Lingala 45–95 $/h (oct. 2026) · RDC exclue mais Congo-B accepté', 'pas_inscrit'],
    ['p-meridial', 'Meridial (Invisible)', 'https://www.meridial.ai/', 'ia', 'Marketplace d\'experts IA · rôles voix FR et Lingala 8–65 $/h · inscription + entretien par IA · 700+ engagements', 'pas_inscrit'],
    ['p-turing', 'Turing', 'https://www.work.turing.com/', 'ia', 'Rôles « Generalist Raters » ~100 $ vus en oct. 2026 · recrute en Afrique · projets ponctuels, durée limitée', 'pas_inscrit'],
    ['p-rws', 'RWS TrainAI', 'https://jobs.lever.co/rws', 'ia', 'Voix FR Cameroun 10 $/h · « AI Conversation Recording – Lingala » ~8 $/h, 2–4 h/j · postuler dès qu\'un rôle FR/Lingala apparaît', 'pas_inscrit'],
    ['p-sigma', 'Sigma AI', 'https://careers.sigma.ai/jobs', 'ia', '« Lingala linguistic projects » récurrents (annotation, transcription) · postuler sur chaque rôle Lingala/FR', 'pas_inscrit'],
    // ——— Langues & voix ———
    ['p-babel', 'Babel Audio', 'https://www.babel.audio/jobs/french_conversation_partner', 'langues', 'Conversation Partner FR 17,50 $/h · conversations enregistrées 15 min · vérifier éligibilité pays avant de former l\'équipe', 'pas_inscrit'],
    ['p-afridata', 'AfriData Labs', 'https://www.linkedin.com/jobs/search/?keywords=AfriData%20Labs', 'langues', '« URGENT AI Language Annotators » Kikongo/Lingala vus sur LinkedIn · postuler via LinkedIn · garder le contact', 'pas_inscrit'],
    ['p-clrlc', 'CLRLC (Langture-Bench)', 'https://www.google.com/search?q=CLRLC+Langture-Bench+lingala', 'langues', 'Benchmark langues africaines · surveiller leurs appels à locuteurs lingala (annonces LinkedIn / site CLRLC)', 'pas_inscrit'],
    ['p-lelapa', 'Lelapa AI', 'https://lelapa.ai/', 'langues', '⭐ PROSPECTION B2B : laboratoire panafricain — proposer des données lingala/kituba · pitch en anglais + échantillons', 'pas_inscrit'],
    // ——— Agrégateurs ———
    ['p-aitrainingjobs', 'AItraining.jobs', 'https://www.aitraining.jobs/', 'agg', 'Vérifier CHAQUE SEMAINE : filtres « french » + « lingala » + « remote » · liste Mindrift, Turing, etc.', 'pas_inscrit'],
    ['p-opentrain', 'OpenTrain', 'https://www.opentrain.ai/jobs/language/fr/', 'agg', '8+ rôles FR en oct. 2026 · créer des alertes par langue (FR + Lingala)', 'pas_inscrit'],
    ['p-ypai', 'Your Personal AI (ypai.ai)', 'https://www.ypai.ai/', 'agg', 'Agrégateur de postes AI trainer · alertes FR/Lingala', 'pas_inscrit'],
    // ——— QA & tests ———
    ['p-utest', 'uTest (Applause)', 'https://www.utest.com/', 'qa', '5–25 $/bug · cycles payés jusqu\'à ~200 $ · profil rempli à 100 % + Android pour les missions « local testing » Brazzaville', 'pas_inscrit'],
    ['p-usertesting', 'UserTesting', 'https://www.usertesting.com/get-paid-to-test', 'qa', '~10 $/test de 20 min · pas de VPN (pays = profil) · élocution claire indispensable', 'pas_inscrit'],
    ['p-userlytics', 'Userlytics', 'https://www.userlytics.com/', 'qa', '~10 €/test · tests en français fréquents · webcam obligatoire', 'pas_inscrit'],
    ['p-testbirds', 'Testbirds', 'https://www.testbirds.com/', 'qa', '~20 €/test · invitations irrégulières, inscriptions multiples', 'pas_inscrit'],
    ['p-playtest', 'PlaytestCloud', 'https://www.playtestcloud.com/', 'qa', '9 $/15 min · paiement 24–72 h · tests de jeux mobiles · bien pour démarrer vite', 'pas_inscrit'],
    // ——— Études ———
    ['p-respondent', 'Respondent.io', 'https://www.respondent.io/', 'etudes', 'Études 50–400 $ · screens stricts · routine : 30 min/jour de candidatures par personne', 'pas_inscrit'],
    ['p-pingpong', 'PingPong', 'https://www.hellopingpong.com/become-a-tester', 'etudes', 'Entretiens 10–100 € · acquis par Hotjar · profil complet = plus d\'invitations', 'pas_inscrit'],
    // ——— Micro-tâches ———
    ['p-clickworker', 'Clickworker (+UHRS)', 'https://www.clickworker.com/', 'micro', 'Micro-tâches 0,05–0,50 $ · accès UHRS 7–14 $/h après évaluations · 1er paiement après 21 jours puis hebdo', 'pas_inscrit'],
    ['p-sproutgigs', 'Sproutgigs', 'https://sproutgigs.com/', 'micro', 'Filet de sécurité · tâches simples et répétitives · petits montants mais paiement rapide', 'pas_inscrit'],
    ['p-neevo', 'Neevo', 'https://www.neevo.ai/', 'micro', '10–15 $/h affiché · tâches texte/audio/image · petits montants, historique de litiges — à tester prudemment', 'pas_inscrit'],
    ['p-premise', 'Premise', 'https://premise.com/', 'micro', 'Collecte terrain par app (photos, prix en boutique) · original à Brazzaville — peu de concurrence locale', 'pas_inscrit'],
    // ——— Freelance ———
    ['p-comeup', 'ComeUp', 'https://comeup.com/', 'free', '1 €/transaction · vitrine : traduction FR↔lingala/kituba, sous-titrage · France = marché naturel', 'pas_inscrit'],
    ['p-fiverr', 'Fiverr', 'https://www.fiverr.com/', 'free', 'Gigs traduction / transcription / sous-titrage FR · titres SEO en anglais', 'pas_inscrit'],
    ['p-upwork', 'Upwork', 'https://www.upwork.com/', 'free', 'Compte agence (plusieurs profils sous un toit) · offres en français FR/CA · missions ponctuelles mais mieux payées', 'pas_inscrit'],
    // ——— Tutorat ———
    ['p-preply', 'Preply', 'https://preply.com/', 'tuto', 'Tutorat FR/EN · commission 33 % → 18 % avec le volume · profil + vidéo soignés', 'pas_inscrit'],
    ['p-italki', 'italki', 'https://www.italki.com/', 'tuto', '~15 % de commission · préparer une vidéo de présentation · créneaux heures Europe', 'pas_inscrit'],
    // ——— Transcription ———
    ['p-rev', 'Rev', 'https://www.rev.com/', 'transc', '18–180 $/h audio selon fichier · sélectif (test d\'entrée dur) · FR demandé', 'pas_inscrit'],
    ['p-gotranscript', 'GoTranscript', 'https://gotranscript.com/', 'transc', 'Payé à la minute · sous-titrage FR · plus accessible que Rev', 'pas_inscrit'],

    // ——— Bloquées / à éviter ———
    ['b-outlier', 'Outlier (Scale AI)', '', 'bloquees', 'Congo-B ABSENT de la liste officielle des pays (juil. 2026) · VPN interdit explicitement + KYC strict → ne pas tenter', 'abandonne'],
    ['b-alignerr', 'Alignerr (Labelbox)', '', 'bloquees', 'Inscription refusée Congo-B (« location restricted ») · KYC strict', 'abandonne'],
    ['b-dataannotation', 'DataAnnotation.tech', '', 'bloquees', 'Anglosphère uniquement (US/CA/UK/IE/NZ/AU)', 'abandonne'],
    ['b-handshake', 'Handshake AI', '', 'bloquees', 'Contributeurs US uniquement', 'abandonne'],
    ['b-soul', 'Soul AI (Deccan AI)', '', 'bloquees', 'Focalisé Inde · rien pour le Congo', 'abandonne'],
    ['b-stellar', 'Stellar AI', '', 'bloquees', 'Fermeture annoncée (« winding down »)', 'abandonne'],
    ['b-mturk', 'Amazon Mechanical Turk', '', 'bloquees', 'Fermé — arrêt total sept. 2026', 'abandonne'],
    ['b-remotasks', 'Remotasks', '', 'bloquees', 'Fermé — migré vers Outlier (lui-même bloqué)', 'abandonne'],
    ['b-toloka', 'Toloka (crowd)', '', 'bloquees', 'Tâches migrées vers Mindrift (juil. 2026) — aller sur Mindrift', 'abandonne'],
    ['b-prolific', 'Prolific', '', 'bloquees', 'Réservé aux pays OCDE — Congo non éligible', 'abandonne'],
    ['b-streetbees', 'Streetbees', '', 'bloquees', 'App consommateur fermée (2025)', 'abandonne'],
    ['b-seoclerks', 'SEOClerks', '', 'bloquees', 'Réputation très douteuse (1/5 Trustpilot)', 'abandonne']
  ];
}

function seedActions() {
  return [
    ['a-equip', 'p1', 'Acheter l\'équipement', 'Laptops reconditionnés ~160 €/poste (5 postes pour commencer)', 'a_faire'],
    ['a-elec', 'p1', 'Sécuriser l\'électricité', 'Onduleur + panneau solaire par poste — coupures = risque n°1', 'a_faire'],
    ['a-net', 'p1', 'Doubler la connexion', 'Fibre MTN Ndako + 4G Airtel en secours (2 FAI = jamais à l\'arrêt)', 'a_faire'],
    ['a-local', 'p1', 'Choisir le local', 'Studio ~76 €/mois, ou démarrage au domicile pour tester', 'a_faire'],
    ['a-comptes', 'p1', 'Créer les comptes personnels de chacun', 'Vrai nom + email dédié + pièce d\'identité de CHACUN — zéro compte partagé, zéro prêt de compte', 'a_faire'],
    ['a-ins-prio', 'p1', 'S\'inscrire sur Mindrift + CrowdGen', 'Priorités n°1 et n°2 — lancer les évaluations dès l\'inscription', 'a_faire'],
    ['a-fr', 'p2', 'Formation français écrit impeccable', '2–3 semaines — c\'est LA compétence que les évaluations filtrent', 'a_faire'],
    ['a-en', 'p2', 'Anglais technique de lecture', 'Comprendre les guidelines en anglais = accès à 3× plus de projets', 'a_faire'],
    ['a-llm', 'p2', 'Entraînement notation/rédaction LLM', 'Réponses soignées, relecture croisée, questions pièges « gold »', 'a_faire'],
    ['a-evals', 'p2', 'Passer ≥ 5 évaluations par personne', 'Non rémunérées — c\'est l\'investissement d\'entrée du business', 'a_faire'],
    ['a-facile', 'p2', 'Démarrer les revenus faciles', 'Clickworker, Sproutgigs, PlaytestCloud, Premise — cash rapide pendant les évaluations', 'a_faire'],
    ['a-etudes', 'p2', 'Candidater Respondent + PingPong', '30 min/jour/personne — une étude à 50–400 $ change un mois', 'a_faire'],
    ['a-agg', 'p2', 'Surveiller les agrégateurs chaque semaine', 'aitraining.jobs + opentrain.ai + ypai.ai — filtres french/lingala', 'a_faire'],
    ['a-focus', 'p3', 'Concentrer chacun sur 2–3 plateformes', 'Les meilleures par personne + 1 filet de sécurité', 'a_faire'],
    ['a-3src', 'p3', 'Règle des 3 sources actives minimum', 'Une plateforme peut couper sans prévenir — jamais dépendre d\'une seule', 'a_faire'],
    ['a-vitrine', 'p3', 'Monter la vitrine B2B lingala/kituba', 'Page Notion : équipe, échantillons, prix — c\'est l\'avantage comparatif du Congo', 'a_faire'],
    ['a-b2b', 'p3', 'Contacter Lelapa AI, Sigma AI, AfriData Labs', 'Pitch en anglais + échantillons lingala/kituba — missions sur mesure mieux payées', 'a_faire'],
    ['a-upwork', 'p3', 'Créer le compte agence Upwork + vitrine ComeUp', 'Traduction FR↔lingala, sous-titrage — la France comme marché', 'a_faire'],
    ['a-kpi', 'p3', 'Suivre les KPI', '100–200 €/pers./mois · ≥ 3 sources actives chacun · 1er contact B2B signé', 'a_faire'],
    ['a-recrute', 'p4', 'Recruter localement', 'Test de français écrit + rigueur, pas de diplôme requis', 'a_faire'],
    ['a-form', 'p4', 'Les anciens forment les nouveaux', 'Process interne + guidelines documentées', 'a_faire'],
    ['a-prime', 'p4', 'Prime qualité sur missions B2B', 'Au-delà de 200 €/mois — aligner les intérêts', 'a_faire']
  ];
}

/* ---------- Init / réinitialisation ---------- */
function initDb({ reset = false } = {}) {
  const db = openDb();
  ensureSchema(db);
  if (reset) {
    db.exec('DELETE FROM platforms; DELETE FROM actions;');
  } else {
    const n = db.prepare('SELECT COUNT(*) AS c FROM platforms').get().c
           + db.prepare('SELECT COUNT(*) AS c FROM actions').get().c;
    if (n > 0) { db.close(); return { skipped: true }; }
  }
  const insP = db.prepare(
    'INSERT INTO platforms (id, name, url, cat, note, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  seedPlatforms().forEach((p, i) => insP.run(p[0], p[1], p[2], p[3], p[4], p[5], i));
  const insA = db.prepare(
    'INSERT INTO actions (id, phase, title, detail, status, position) VALUES (?, ?, ?, ?, ?, ?)'
  );
  seedActions().forEach((a, i) => insA.run(a[0], a[1], a[2], a[3], a[4], i));
  db.close();
  return { seeded: true, platforms: seedPlatforms().length, actions: seedActions().length };
}

/* ---------- Snapshot JSON rotatif ---------- */
function makeSnapshot() {
  const db = openDb();
  const platforms = db.prepare('SELECT * FROM platforms ORDER BY position, id').all();
  const actions = db.prepare('SELECT * FROM actions ORDER BY position, id').all();
  db.close();

  mkdirp(BACKUP_DIR);
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
                pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  const file = path.join(BACKUP_DIR, 'suivi-brazza-' + stamp + '.json');
  const payload = { exported_at: new Date().toISOString(), version: 2, platforms, actions };
  fs.writeFileSync(file, JSON.stringify(payload, null, 1), 'utf8');

  // Rotation : garder les 40 plus récents
  const olds = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^suivi-brazza-\d{8}-\d{6}\.json$/.test(f))
    .sort()
    .slice(0, -40);
  olds.forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (_) {} });

  const db2 = openDb();
  db2.prepare('INSERT INTO snapshots (file) VALUES (?)').run(path.basename(file));
  db2.close();
  return file;
}

/* ---------- Import d'un export JSON (v1 localStorage ou v2 snapshot) ---------- */
function importJson(filePath, { replace = true } = {}) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const platforms = Array.isArray(raw.platforms) ? raw.platforms : null;
  const actions = Array.isArray(raw.actions) ? raw.actions : null;
  if (!platforms && !actions) throw new Error('Format non reconnu (attend { platforms, actions })');

  const db = openDb();
  ensureSchema(db);
  if (replace) db.exec('DELETE FROM platforms; DELETE FROM actions;');
  const stmtP = db.prepare(`INSERT OR REPLACE INTO platforms
    (id, name, url, cat, note, status, unote, gain, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  (platforms || []).forEach((p, i) => stmtP.run(
    p.id || ('p-import-' + i),
    String(p.name || 'Sans nom'),
    String(p.url || ''),
    String(p.cat || 'ia'),
    String(p.note || ''),
    P_STATUSES.includes(p.status) ? p.status : ((p.cat === 'bloquees') ? 'abandonne' : 'pas_inscrit'),
    String(p.unote || ''),
    String(p.gain || ''),
    typeof p.position === 'number' ? p.position : i
  ));
  const stmtA = db.prepare(`INSERT OR REPLACE INTO actions
    (id, phase, title, detail, status, unote, position) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  (actions || []).forEach((a, i) => stmtA.run(
    a.id || ('a-import-' + i),
    String(a.phase || 'p1'),
    String(a.title || ''),
    String(a.detail || ''),
    ['a_faire', 'en_cours', 'fait'].includes(a.status) ? a.status : 'a_faire',
    String(a.unote || ''),
    typeof a.position === 'number' ? a.position : i
  ));
  const res = {
    platforms: (platforms || []).length,
    actions: (actions || []).length,
    reset: db.prepare('SELECT COUNT(*) AS c FROM platforms').get().c,
    actions_total: db.prepare('SELECT COUNT(*) AS c FROM actions').get().c
  };
  db.close();
  return res;
}

module.exports = { openDb, ensureSchema, initDb, makeSnapshot, importJson, DB_PATH, BACKUP_DIR, seedPlatforms, seedActions };

/* ---------- CLI ---------- */
if (require.main === module) {
  const cmd = process.argv[2] || 'help';
  try {
    if (cmd === 'init') {
      const r = initDb({ reset: process.argv.includes('--reset') });
      console.log(r.skipped ? 'Base déjà initialisée (utilisez --reset pour repartir de zéro).' : 'Base initialisée :', r);
    } else if (cmd === 'snapshot') {
      console.log('Snapshot écrit :', makeSnapshot());
    } else if (cmd === 'import') {
      const f = process.argv[3];
      if (!f) { console.error('Usage: node db.js import <fichier.json>'); process.exit(1); }
      console.log('Import OK :', importJson(f));
    } else {
      console.log(`Utilisation :
  node db.js init [--reset]   crée/initialise la base (données du dossier)
  node db.js snapshot         écrit data/backups/suivi-brazza-<date>.json (+ rotation 40)
  node db.js import <file>    importe un export JSON (v1 ou v2), remplace le contenu`);
    }
  } catch (e) { console.error('Erreur :', e.message); process.exit(1); }
}
