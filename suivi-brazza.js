'use strict';

/* ============ Modèle ============ */
const KEY = 'brazza_tracker_v2';

const P_STATUSES = {
  pas_inscrit:    { label: 'Pas inscrit',                bg: '#eef0f2', fg: '#4b5561' },
  en_cours:       { label: 'Inscription / éval. en cours', bg: '#e0ecfb', fg: '#1d4ed8' },
  sans_missions:  { label: 'Inscrit · pas de missions',   bg: '#fdf0d5', fg: '#b45309' },
  avec_missions:  { label: 'Inscrit · missions ✔',        bg: '#d8f2de', fg: '#166534' },
  pause:          { label: 'À laisser / en pause',        bg: '#ede6f7', fg: '#6d28d9' },
  abandonne:      { label: 'Abandonné',                   bg: '#f6e2e2', fg: '#9f1239' }
};
const A_STATUSES = {
  a_faire: { label: 'À faire', bg: '#eef0f2', fg: '#4b5561' },
  en_cours: { label: 'En cours', bg: '#e0ecfb', fg: '#1d4ed8' },
  fait:    { label: 'Fait ✔',  bg: '#d8f2de', fg: '#166534' }
};
const A_ORDER = ['a_faire', 'en_cours', 'fait'];

const CATS = [
  { id: 'ia',      label: '🤖 Entraînement IA & données' },
  { id: 'langues', label: '🗣️ Langues & voix (Lingala/Kituba/FR)' },
  { id: 'agg',     label: '📡 Agrégateurs à surveiller' },
  { id: 'qa',      label: '🧪 Tests apps & sites' },
  { id: 'etudes',  label: '🎯 Études rémunérées' },
  { id: 'micro',   label: '⚙️ Micro-tâches' },
  { id: 'free',    label: '💼 Freelance' },
  { id: 'tuto',    label: '🎓 Tutorat' },
  { id: 'transc',  label: '📝 Transcription & sous-titrage' }
];

const PHASES = [
  { id: 'p1', label: 'Phase 1 · Jours 1–15 — Installation' },
  { id: 'p2', label: 'Phase 2 · Jours 15–45 — Formation & évaluations' },
  { id: 'p3', label: 'Phase 3 · Jours 45–90 — Régime de croisière' },
  { id: 'p4', label: 'Phase 4 · Mois 4+ — Scale' }
];

/* ============ Données du dossier (réinitialisation) ============ */
function seed() {
  return {
    platforms: [
      // ——— IA & données ———
      { id: 'p-mindrift', name: 'Mindrift (Toloka)', url: 'https://www.mindrift.com/', cat: 'ia', note: '⭐ PRIORITÉ N°1 — ouvert au Congo (vérifié mai 2026) · 35–100 $/h · Payoneer 2×/mois · interdit : VPN' },
      { id: 'p-crowdgen', name: 'CrowdGen (Appen)', url: 'https://crowdgen.com/', cat: 'ia', note: '⭐ PRIORITÉ N°2 — rôles « Open to Africa » · projet FR ~22 $/h · s\'inscrire, remplir tous les profils de langue' },
      { id: 'p-oneforma', name: 'OneForma (Centific)', url: 'https://www.oneforma.com/', cat: 'ia', note: '5–20 $/session · paiements mensuels lents · filtrer les projets exigeant une présence physique (hors Congo)' },
      { id: 'p-telus', name: 'TELUS Digital AI', url: 'https://www.telusinternational.ai/', cat: 'ia', note: '4–18 $/h rôles rater · chercher les rôles « Open to Africa » / français africain · projets coupés mi-2026 : vérifier avant formation' },
      { id: 'p-micro1', name: 'Micro1', url: 'https://www.micro1.io/', cat: 'ia', note: '20–400 $/h selon rôle · entretien via leur IA · rôle Lingala vu à 45–95 $/h (oct. 2026) · RDC exclue mais Congo-B accepté' },
      { id: 'p-meridial', name: 'Meridial (Invisible)', url: 'https://www.meridial.ai/', cat: 'ia', note: 'Marketplace d\'experts IA · rôles voix FR et Lingala 8–65 $/h · inscription + entretien par IA · 700+ engagements' },
      { id: 'p-turing', name: 'Turing', url: 'https://www.work.turing.com/', cat: 'ia', note: 'Rôles « Generalist Raters » ~100 $ vus en oct. 2026 · recrute en Afrique · projets ponctuels, durée limitée' },
      { id: 'p-rws', name: 'RWS TrainAI', url: 'https://jobs.lever.co/rws', cat: 'ia', note: 'Voix FR Cameroun 10 $/h · « AI Conversation Recording – Lingala » ~8 $/h, 2–4 h/j · postuler dès qu\'un rôle FR/Lingala apparaît' },
      { id: 'p-sigma', name: 'Sigma AI', url: 'https://careers.sigma.ai/jobs', cat: 'ia', note: '« Lingala linguistic projects » récurrents (annotation, transcription) · postuler sur chaque rôle Lingala/FR' },
      // ——— Langues & voix ———
      { id: 'p-babel', name: 'Babel Audio', url: 'https://www.babel.audio/jobs/french_conversation_partner', cat: 'langues', note: 'Conversation Partner FR 17,50 $/h · conversations enregistrées 15 min · vérifier éligibilité pays avant de former l\'équipe' },
      { id: 'p-afridata', name: 'AfriData Labs', url: 'https://www.linkedin.com/jobs/search/?keywords=AfriData%20Labs', cat: 'langues', note: '« URGENT AI Language Annotators » Kikongo/Lingala vus sur LinkedIn · postuler via LinkedIn · garder le contact' },
      { id: 'p-clrlc', name: 'CLRLC (Langture-Bench)', url: 'https://www.google.com/search?q=CLRLC+Langture-Bench+lingala', cat: 'langues', note: 'Benchmark langues africaines · surveiller leurs appels à locuteurs lingala (annonces LinkedIn / site CLRLC)' },
      { id: 'p-lelapa', name: 'Lelapa AI', url: 'https://lelapa.ai/', cat: 'langues', note: '⭐ PROSPECTION B2B : laboratoire panafricain — proposer des données lingala/kituba · pitch en anglais + échantillons' },
      // ——— Agrégateurs ———
      { id: 'p-aitrainingjobs', name: 'AItraining.jobs', url: 'https://www.aitraining.jobs/', cat: 'agg', note: 'Vérifier CHAQUE SEMAINE : filtres « french » + « lingala » + « remote » · source qui liste Mindrift, Turing, etc.' },
      { id: 'p-opentrain', name: 'OpenTrain', url: 'https://www.opentrain.ai/jobs/language/fr/', cat: 'agg', note: '8+ rôles FR en oct. 2026 · créer des alertes par langue (FR + Lingala)' },
      { id: 'p-ypai', name: 'Your Personal AI (ypai.ai)', url: 'https://www.ypai.ai/', cat: 'agg', note: 'Agrégateur de postes AI trainer · alertes FR/Lingala' },
      // ——— QA & tests ———
      { id: 'p-utest', name: 'uTest (Applause)', url: 'https://www.utest.com/', cat: 'qa', note: '5–25 $/bug · cycles payés jusqu\'à ~200 $ · remplir le profil à 100 % + tester sur Android pour les missions « local testing » Brazzaville' },
      { id: 'p-usertesting', name: 'UserTesting', url: 'https://www.usertesting.com/get-paid-to-test', cat: 'qa', note: '~10 $/test de 20 min · pas de VPN (pays = profil) · élocution claire indispensable' },
      { id: 'p-userlytics', name: 'Userlytics', url: 'https://www.userlytics.com/', cat: 'qa', note: '~10 €/test · tests en français fréquents · webcam obligatoire' },
      { id: 'p-testbirds', name: 'Testbirds', url: 'https://www.testbirds.com/', cat: 'qa', note: '~20 €/test · invitations irrégulières, inscriptions multiples' },
      { id: 'p-playtest', name: 'PlaytestCloud', url: 'https://www.playtestcloud.com/', cat: 'qa', note: '9 $/15 min · paiement 24–72 h · tests de jeux mobiles · bien pour démarrer vite' },
      // ——— Études ———
      { id: 'p-respondent', name: 'Respondent.io', url: 'https://www.respondent.io/', cat: 'etudes', note: 'Études 50–400 $ · screens stricts · routine : 30 min/jour de candidatures par personne' },
      { id: 'p-pingpong', name: 'PingPong', url: 'https://www.hellopingpong.com/become-a-tester', cat: 'etudes', note: 'Entretiens 10–100 € · acquis par Hotjar · profil complet = plus d\'invitations' },
      // ——— Micro-tâches ———
      { id: 'p-clickworker', name: 'Clickworker (+UHRS)', url: 'https://www.clickworker.com/', cat: 'micro', note: 'Micro-tâches 0,05–0,50 $ · accès UHRS 7–14 $/h après évaluations · 1er paiement après 21 jours puis hebdo' },
      { id: 'p-sproutgigs', name: 'Sproutgigs', url: 'https://sproutgigs.com/', cat: 'micro', note: 'Filet de sécurité · tâches simples et répétitives · petits montants mais paiement rapide' },
      { id: 'p-neevo', name: 'Neevo', url: 'https://www.neevo.ai/', cat: 'micro', note: '10–15 $/h affiché · tâches texte/audio/image · petits montants, historique de litiges — à tester prudemment' },
      { id: 'p-premise', name: 'Premise', url: 'https://premise.com/', cat: 'micro', note: 'Collecte terrain par app (photos, prix en boutique) · original à Brazzaville — peu de concurrence locale' },
      // ——— Freelance ———
      { id: 'p-comeup', name: 'ComeUp', url: 'https://comeup.com/', cat: 'free', note: '1 €/transaction · vitrine : traduction FR↔lingala/kituba, sous-titrage · France = marché naturel' },
      { id: 'p-fiverr', name: 'Fiverr', url: 'https://www.fiverr.com/', cat: 'free', note: 'Gigs traduction / transcription / sous-titrage FR · titres SEO en anglais' },
      { id: 'p-upwork', name: 'Upwork', url: 'https://www.upwork.com/', cat: 'free', note: 'Compte agence (plusieurs profils sous un toit) · offres en français FR/CA · missions ponctuelles mais mieux payées' },
      // ——— Tutorat ———
      { id: 'p-preply', name: 'Preply', url: 'https://preply.com/', cat: 'tuto', note: 'Tutorat FR/EN · commission 33 % → 18 % avec le volume · paiement via PayPal/skript · profil + vidéo soignés' },
      { id: 'p-italki', name: 'italki', url: 'https://www.italki.com/', cat: 'tuto', note: '~15 % de commission · préparer une vidéo de présentation · créneaux heures Europe' },
      // ——— Transcription ———
      { id: 'p-rev', name: 'Rev', url: 'https://www.rev.com/', cat: 'transc', note: '18–180 $/h audio selon fichier · sélectif (test d\'entrée dur) · FR demandé' },
      { id: 'p-gotranscript', name: 'GoTranscript', url: 'https://gotranscript.com/', cat: 'transc', note: 'Payé à la minute · sous-titrage FR · plus accessible que Rev' },

      // ——— Bloquées / à éviter (informatif) ———
      { id: 'b-outlier', name: 'Outlier (Scale AI)', cat: 'bloquees', status: 'abandonne', note: 'Congo-B ABSENT de la liste officielle des pays (juil. 2026) · VPN interdit explicitement + KYC strict → ne pas tenter' },
      { id: 'b-alignerr', name: 'Alignerr (Labelbox)', cat: 'bloquees', status: 'abandonne', note: 'Inscription refusée Congo-B (« location restricted ») · KYC strict' },
      { id: 'b-dataannotation', name: 'DataAnnotation.tech', cat: 'bloquees', status: 'abandonne', note: 'Anglosphère uniquement (US/CA/UK/IE/NZ/AU)' },
      { id: 'b-handshake', name: 'Handshake AI', cat: 'bloquees', status: 'abandonne', note: 'Contributeurs US uniquement' },
      { id: 'b-soul', name: 'Soul AI (Deccan AI)', cat: 'bloquees', status: 'abandonne', note: 'Focalisé Inde · rien pour le Congo' },
      { id: 'b-stellar', name: 'Stellar AI', cat: 'bloquees', status: 'abandonne', note: 'Fermeture annoncée (« winding down »)' },
      { id: 'b-mturk', name: 'Amazon Mechanical Turk', cat: 'bloquees', status: 'abandonne', note: 'Fermé — arrêt total sept. 2026' },
      { id: 'b-remotasks', name: 'Remotasks', cat: 'bloquees', status: 'abandonne', note: 'Fermé — migré vers Outlier (lui-même bloqué)' },
      { id: 'b-toloka', name: 'Toloka (crowd)', cat: 'bloquees', status: 'abandonne', note: 'Tâches migrées vers Mindrift (juil. 2026) — aller sur Mindrift' },
      { id: 'b-prolific', name: 'Prolific', cat: 'bloquees', status: 'abandonne', note: 'Réservé aux pays OCDE — Congo non éligible' },
      { id: 'b-streetbees', name: 'Streetbees', cat: 'bloquees', status: 'abandonne', note: 'App consommateur fermée (2025)' },
      { id: 'b-seoclerks', name: 'SEOClerks', cat: 'bloquees', status: 'abandonne', note: 'Réputation très douteuse (1/5 Trustpilot)' }
    ].map(p => Object.assign({ url: '', status: 'pas_inscrit', unote: '', gain: '' }, p)),

    actions: [
      // Phase 1
      { id: 'a-equip', phase: 'p1', title: 'Acheter l\'équipement', detail: 'Laptops reconditionnés ~160 €/poste (5 postes pour commencer)', status: 'a_faire' },
      { id: 'a-elec', phase: 'p1', title: 'Sécuriser l\'électricité', detail: 'Onduleur + panneau solaire par poste — coupures = risque n°1', status: 'a_faire' },
      { id: 'a-net', phase: 'p1', title: 'Doubler la connexion', detail: 'Fibre MTN Ndako + 4G Airtel en secours (2 FAI = jamais à l\'arrêt)', status: 'a_faire' },
      { id: 'a-local', phase: 'p1', title: 'Choisir le local', detail: 'Studio ~76 €/mois, ou démarrage au domicile pour tester', status: 'a_faire' },
      { id: 'a-comptes', phase: 'p1', title: 'Créer les comptes personnels de chacun', detail: 'Vrai nom + email dédié + pièce d\'identité de CHACUN — zéro compte partagé, zéro prêt de compte', status: 'a_faire' },
      { id: 'a-ins-prio', phase: 'p1', title: 'S\'inscrire sur Mindrift + CrowdGen', detail: 'Priorités n°1 et n°2 — lancer les évaluations dès l\'inscription', status: 'a_faire' },
      // Phase 2
      { id: 'a-fr', phase: 'p2', title: 'Formation français écrit impeccable', detail: '2–3 semaines — c\'est LA compétence que les évaluations filtrent', status: 'a_faire' },
      { id: 'a-en', phase: 'p2', title: 'Anglais technique de lecture', detail: 'Comprendre les guidelines en anglais = accès à 3× plus de projets', status: 'a_faire' },
      { id: 'a-llm', phase: 'p2', title: 'Entraînement notation/rédaction LLM', detail: 'Réponses soignées, relecture croisée, questions pièges « gold »', status: 'a_faire' },
      { id: 'a-evals', phase: 'p2', title: 'Passer ≥ 5 évaluations par personne', detail: 'Non rémunérées — c\'est l\'investissement d\'entrée du business', status: 'a_faire' },
      { id: 'a-facile', phase: 'p2', title: 'Démarrer les revenus faciles', detail: 'Clickworker, Sproutgigs, PlaytestCloud, Premise — cash rapide pendant les évaluations', status: 'a_faire' },
      { id: 'a-etudes', phase: 'p2', title: 'Candidater Respondent + PingPong', detail: '30 min/jour/personne — une étude à 50–400 $ change un mois', status: 'a_faire' },
      { id: 'a-agg', phase: 'p2', title: 'Surveiller les agrégateurs chaque semaine', detail: 'aitraining.jobs + opentrain.ai + ypai.ai — filtres french/lingala', status: 'a_faire' },
      // Phase 3
      { id: 'a-focus', phase: 'p3', title: 'Concentrer chacun sur 2–3 plateformes', detail: 'Les meilleures par personne + 1 filet de sécurité', status: 'a_faire' },
      { id: 'a-3src', phase: 'p3', title: 'Règle des 3 sources actives minimum', detail: 'Une plateforme peut couper sans prévenir — jamais dépendre d\'une seule', status: 'a_faire' },
      { id: 'a-vitrine', phase: 'p3', title: 'Monter la vitrine B2B lingala/kituba', detail: 'Page Notion : équipe, échantillons, prix — c\'est l\'avantage comparatif du Congo', status: 'a_faire' },
      { id: 'a-b2b', phase: 'p3', title: 'Contacter Lelapa AI, Sigma AI, AfriData Labs', detail: 'Pitch en anglais + échantillons lingala/kituba — missions sur mesure mieux payées', status: 'a_faire' },
      { id: 'a-upwork', phase: 'p3', title: 'Créer le compte agence Upwork + vitrine ComeUp', detail: 'Traduction FR↔lingala, sous-titrage — la France comme marché', status: 'a_faire' },
      { id: 'a-kpi', phase: 'p3', title: 'Suivre les KPI', detail: '100–200 €/pers./mois · ≥ 3 sources actives chacun · 1er contact B2B signé', status: 'a_faire' },
      // Phase 4
      { id: 'a-recrute', phase: 'p4', title: 'Recruter localement', detail: 'Test de français écrit + rigueur, pas de diplôme requis', status: 'a_faire' },
      { id: 'a-form', phase: 'p4', title: 'Les anciens forment les nouveaux', detail: 'Process interne + guidelines documentées', status: 'a_faire' },
      { id: 'a-prime', phase: 'p4', title: 'Prime qualité sur missions B2B', detail: 'Au-delà de 200 €/mois — aligner les intérêts', status: 'a_faire' }
    ]
  };
}

/* ============ Persistance ============ */
let db = null;
let ui = { tab: 'platforms', pstatus: 'all', cat: 'all', q: '' };

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.warn('Sauvegarde impossible :', e); }
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.platforms) || !Array.isArray(d.actions)) return seed();
    d.platforms.forEach(p => {
      p.url = p.url || ''; p.unote = p.unote || ''; p.gain = p.gain || '';
      if (!p.status) p.status = (p.cat === 'bloquees') ? 'abandonne' : 'pas_inscrit';
      if (!p.id) p.id = 'p' + Math.random().toString(36).slice(2);
    });
    d.actions.forEach(a => {
      a.detail = a.detail || ''; if (!a.status) a.status = 'a_faire';
      if (!a.id) a.id = 'a' + Math.random().toString(36).slice(2);
    });
    return d;
  } catch (e) { return seed(); }
}

/* ============ Utilitaires ============ */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function catLabel(id) {
  const c = CATS.find(x => x.id === id);
  return c ? c.label : id;
}
function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ============ Rendu : stats ============ */
function renderStats() {
  const main = db.platforms.filter(p => p.cat !== 'bloquees');
  const counts = {};
  Object.keys(P_STATUSES).forEach(k => counts[k] = 0);
  main.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
  const totalGain = main.reduce((s, p) => s + (parseFloat(p.gain) || 0), 0);

  let h = '<span class="chip' + (ui.pstatus === 'all' ? ' active' : '') + '" data-st="all">Toutes · ' + main.length + '</span>';
  Object.keys(P_STATUSES).forEach(k => {
    const st = P_STATUSES[k];
    h += '<span class="chip' + (ui.pstatus === k ? ' active' : '') + '" data-st="' + k + '">' +
      '<span class="dot" style="background:' + st.bg + '"></span>' + st.label.split(' · ')[0] + ' · ' + counts[k] + '</span>';
  });
  h += '<span class="chip money">💰 ' + totalGain + ' €/mois encaissés</span>';
  document.getElementById('stats').innerHTML = h;
  document.querySelectorAll('#stats .chip[data-st]').forEach(el => {
    el.addEventListener('click', () => { ui.pstatus = el.dataset.st; renderStats(); renderPlatforms(); });
  });
}

/* ============ Rendu : plateformes ============ */
function statusSelect(p) {
  const st = P_STATUSES[p.status] || P_STATUSES.pas_inscrit;
  let opts = Object.keys(P_STATUSES).map(k =>
    '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + esc(P_STATUSES[k].label) + '</option>'
  ).join('');
  return '<select class="stsel" data-id="' + p.id + '" style="background:' + st.bg + ';color:' + st.fg + '">' + opts + '</select>';
}

function renderPlatforms() {
  const q = ui.q.trim().toLowerCase();
  const list = db.platforms.filter(p => {
    if (ui.pstatus !== 'all' && p.status !== ui.pstatus) return false;
    if (ui.cat !== 'all' && p.cat !== ui.cat) return false;
    if (q) {
      const hay = (p.name + ' ' + p.note + ' ' + p.unote).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const blocked = list.filter(p => p.cat === 'bloquees');
  const main = list.filter(p => p.cat !== 'bloquees');

  let h = '';
  CATS.forEach(c => {
    const items = main.filter(p => p.cat === c.id);
    if (!items.length) return;
    h += '<details class="catsec" open><summary>' + esc(c.label) +
      ' <span class="cnt">· ' + items.length + '</span><span class="tri">▾</span></summary>';
    items.forEach(p => {
      h += '<div class="card" data-pid="' + p.id + '">' +
        '<div class="row1">' +
        (p.url
          ? '<a class="pname" target="_blank" rel="noopener" href="' + esc(p.url) + '">' + esc(p.name) + ' ↗</a>'
          : '<span class="pname">' + esc(p.name) + '</span>') +
        '<span class="catchip">' + esc(catLabel(p.cat).replace(/^[^\s]+\s/, '')) + '</span>' +
        statusSelect(p) +
        '</div>' +
        (p.note ? '<div class="pnote">' + esc(p.note) + '</div>' : '') +
        '<div class="row2">' +
        '<input class="unote" placeholder="Tes notes (login utilisé, date d\'inscription…)" value="' + esc(p.unote) + '">' +
        '<input class="gain" type="number" min="0" step="1" placeholder="€/mois" value="' + esc(p.gain) + '" title="Gains réels du mois dernier">' +
        '<button class="del" data-id="' + p.id + '" title="Supprimer">✕</button>' +
        '</div></div>';
    });
    h += '</details>';
  });
  if (!main.length && !blocked.length) {
    h = '<p class="hint">Aucune plateforme ne correspond au filtre.</p>';
  }
  document.getElementById('plist').innerHTML = h;

  // Section bloquées
  const bh = blocked.map(p =>
    '<div class="blkrow"><span class="bn">' + esc(p.name) + '</span><span class="br">' + esc(p.note) + '</span></div>'
  ).join('');
  document.getElementById('blklist').innerHTML = bh || '<p class="hint">—</p>';
  document.getElementById('blksec').style.display = db.platforms.some(p => p.cat === 'bloquees') ? '' : 'none';
}

/* ============ Rendu : actions ============ */
function renderActions() {
  let h = '';
  PHASES.forEach(ph => {
    const items = db.actions.filter(a => a.phase === ph.id);
    if (!items.length) return;
    h += '<details class="catsec" open><summary>' + esc(ph.label) +
      ' <span class="cnt">· ' + items.filter(a => a.status === 'fait').length + '/' + items.length + '</span><span class="tri">▾</span></summary>';
    items.forEach(a => {
      const st = A_STATUSES[a.status] || A_STATUSES.a_faire;
      h += '<div class="arow' + (a.status === 'fait' ? ' done' : '') + '" data-aid="' + a.id + '">' +
        '<button class="astat" data-id="' + a.id + '" style="background:' + st.bg + ';color:' + st.fg + '">' + esc(st.label) + '</button>' +
        '<div class="body"><div class="at">' + esc(a.title) + '</div>' +
        (a.detail ? '<div class="ad">' + esc(a.detail) + '</div>' : '') +
        '<input class="unote" data-aid="' + a.id + '" placeholder="Tes notes…" value="' + esc(a.unote || '') + '" style="margin-top:6px">' +
        '</div>' +
        '<button class="del" data-aid="' + a.id + '" title="Supprimer">✕</button>' +
        '</div>';
    });
    h += '</details>';
  });
  document.getElementById('alist').innerHTML = h;
}

/* ============ Re-rendu complet ============ */
function render() {
  renderStats();
  renderPlatforms();
  renderActions();
}

/* ============ Événements ============ */
function bindEvents() {
  // Onglets
  document.querySelectorAll('#tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      ui.tab = b.dataset.tab;
      ['platforms', 'actions', 'rules'].forEach(t => {
        document.getElementById('tab-' + t).style.display = (t === ui.tab) ? '' : 'none';
      });
      document.getElementById('stats').style.display = (ui.tab === 'platforms') ? '' : 'none';
      document.getElementById('statshint').style.display = (ui.tab === 'platforms') ? '' : 'none';
    });
  });

  // Filtres
  document.getElementById('q').addEventListener('input', e => { ui.q = e.target.value; renderPlatforms(); });
  const fcat = document.getElementById('fcat');
  CATS.forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.label;
    fcat.appendChild(o);
  });
  fcat.addEventListener('change', () => { ui.cat = fcat.value; renderPlatforms(); });

  // Ajout plateforme
  const addcat = document.getElementById('addcat');
  CATS.forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.label;
    addcat.appendChild(o);
  });
  document.getElementById('addp').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    db.platforms.push({
      id: uid('p'),
      name: f.querySelector('[data-f=name]').value.trim(),
      url: f.querySelector('[data-f=url]').value.trim(),
      cat: f.querySelector('[data-f=cat]').value,
      note: f.querySelector('[data-f=note]').value.trim(),
      status: 'pas_inscrit', unote: '', gain: ''
    });
    f.reset(); save(); render();
  });

  // Ajout action
  const addphase = document.getElementById('addphase');
  PHASES.forEach(p => {
    const o = document.createElement('option'); o.value = p.id; o.textContent = p.label;
    addphase.appendChild(o);
  });
  document.getElementById('adda').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    db.actions.push({
      id: uid('a'),
      phase: f.querySelector('[data-f=phase]').value,
      title: f.querySelector('[data-f=title]').value.trim(),
      detail: f.querySelector('[data-f=detail]').value.trim(),
      status: 'a_faire', unote: ''
    });
    f.reset(); save(); renderActions();
  });

  // Délégation : plateformes
  document.getElementById('plist').addEventListener('change', e => {
    const t = e.target;
    if (t.classList.contains('stsel')) {
      const p = db.platforms.find(x => x.id === t.dataset.id);
      if (p) {
        p.status = t.value;
        const st = P_STATUSES[p.status];
        t.style.background = st.bg; t.style.color = st.fg;
        save(); renderStats();
      }
    } else if (t.classList.contains('unote')) {
      const p = db.platforms.find(x => x.id === t.closest('.card').dataset.pid);
      if (p) { p.unote = t.value; save(); }
    } else if (t.classList.contains('gain')) {
      const p = db.platforms.find(x => x.id === t.closest('.card').dataset.pid);
      if (p) { p.gain = t.value; save(); renderStats(); }
    }
  });
  document.getElementById('plist').addEventListener('click', e => {
    if (e.target.classList.contains('del')) {
      const p = db.platforms.find(x => x.id === e.target.dataset.id);
      if (p && confirm('Supprimer « ' + p.name + ' » de la liste ?')) {
        db.platforms = db.platforms.filter(x => x.id !== p.id);
        save(); render();
      }
    }
  });

  // Délégation : actions
  document.getElementById('alist').addEventListener('click', e => {
    const t = e.target;
    if (t.classList.contains('astat')) {
      const a = db.actions.find(x => x.id === t.dataset.id);
      if (a) {
        const i = A_ORDER.indexOf(a.status);
        a.status = A_ORDER[(i + 1) % A_ORDER.length];
        save(); renderActions();
      }
    } else if (t.classList.contains('del')) {
      const a = db.actions.find(x => x.id === t.dataset.aid);
      if (a && confirm('Supprimer l\'action « ' + a.title + ' » ?')) {
        db.actions = db.actions.filter(x => x.id !== a.id);
        save(); renderActions();
      }
    }
  });
  document.getElementById('alist').addEventListener('change', e => {
    if (e.target.classList.contains('unote')) {
      const a = db.actions.find(x => x.id === e.target.dataset.aid);
      if (a) { a.unote = e.target.value; save(); }
    }
  });

  // Export / import / reset
  document.getElementById('btnexport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'suivi-brazza-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('btnimport').addEventListener('click', () => {
    document.getElementById('importfile').click();
  });
  document.getElementById('importfile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d || !Array.isArray(d.platforms) || !Array.isArray(d.actions)) throw new Error('format');
        db = d; save(); render();
        alert('Sauvegarde importée ✔');
      } catch (err) { alert('Fichier invalide — import annulé.'); }
    };
    fr.readAsText(file);
    e.target.value = '';
  });
  document.getElementById('btnreset').addEventListener('click', () => {
    if (confirm('Tout réinitialiser aux données du dossier ?\nTes statuts, notes et gains actuels seront perdus.')) {
      db = seed(); save(); render();
    }
  });
}

/* ============ Démarrage ============ */
db = load();
render();
bindEvents();
