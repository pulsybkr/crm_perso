'use client';

/* Constantes partagées entre composants (importées côté client uniquement). */
export const P_STATUSES = {
  pas_inscrit:   { label: 'Pas inscrit',                   short: 'Pas inscrit',    bg: '#eef0f2', fg: '#4b5561' },
  en_cours:      { label: 'Inscription / éval. en cours',  short: 'En cours',       bg: '#e0ecfb', fg: '#1d4ed8' },
  sans_missions: { label: 'Inscrit · pas de missions',     short: 'Sans missions',  bg: '#fdf0d5', fg: '#b45309' },
  avec_missions: { label: 'Inscrit · missions ✔',         short: 'Missions ✔',     bg: '#d8f2de', fg: '#166534' },
  pause:         { label: 'À laisser / en pause',           short: 'Pause',          bg: '#ede6f7', fg: '#6d28d9' },
  abandonne:     { label: 'Abandonné',                     short: 'Abandonné',      bg: '#f6e2e2', fg: '#9f1239' }
};

export const A_STATUSES = {
  a_faire: { label: 'À faire',  bg: '#eef0f2', fg: '#4b5561' },
  en_cours: { label: 'En cours', bg: '#e0ecfb', fg: '#1d4ed8' },
  fait:    { label: 'Fait ✔',   bg: '#d8f2de', fg: '#166534' }
};

export const CATS = [
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
export const CAT_SHORT = {
  ia: '🤖 IA', langues: '🗣️ Langues', agg: '📡 Agg.', qa: '🧪 QA', etudes: '🎯 Études',
  micro: '⚙️ Micro', free: '💼 Freelance', tuto: '🎓 Tutorat', transc: '📝 Transc.'
};
