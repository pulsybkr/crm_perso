'use client';

import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import Kanban from './components/Kanban.jsx';
import PlatformKanban from './components/PlatformKanban.jsx';
import ActionModal from './components/ActionModal.jsx';
import PlatformModal from './components/PlatformModal.jsx';
import CredentialsModal from './components/CredentialsModal.jsx';
import { P_STATUSES, A_STATUSES, CATS } from './lib/kb.js';

/* ================= Constantes ================= */
const PHASES = [
  { id: 'p1', label: 'Phase 1 · Jours 1–15 — Installation' },
  { id: 'p2', label: 'Phase 2 · Jours 15–45 — Formation & évaluations' },
  { id: 'p3', label: 'Phase 3 · Jours 45–90 — Régime de croisière' },
  { id: 'p4', label: 'Phase 4 · Mois 4+ — Scale' }
];
const PHASE_LABEL = Object.fromEntries(PHASES.map(p => [p.id, p.label]));

/* ================= API ================= */
async function api(path, opts) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) }
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('HTTP ' + r.status));
  return r.json();
}
const getPlatforms = () => api('/api/platforms');
const getActions = () => api('/api/actions');
const patchPlatform = (id, fields) => api('/api/platforms', { method: 'PATCH', body: JSON.stringify({ id, ...fields }) });
const postPlatform = (p) => api('/api/platforms', { method: 'POST', body: JSON.stringify(p) });
const delPlatform = (id) => api('/api/platforms?id=' + encodeURIComponent(id), { method: 'DELETE' });
const patchAction = (id, fields) => api('/api/actions', { method: 'PATCH', body: JSON.stringify({ id, ...fields }) });
const postAction = (a) => api('/api/actions', { method: 'POST', body: JSON.stringify(a) });
const delAction = (id) => api('/api/actions?id=' + encodeURIComponent(id), { method: 'DELETE' });
const postSnapshot = () => api('/api/snapshot', { method: 'POST' });

/* ================= Hooks ================= */
function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ================= App ================= */
export default function Home() {
  const [platforms, setPlatforms] = useState(null);
  const [actions, setActions] = useState(null);
  const [tab, setTab] = useState('platforms');
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState('');
  const [snap, setSnap] = useState('—');
  const [loading, setLoading] = useState(true);

  /* Modales */
  const [editAction, setEditAction] = useState(null);   // ActionModal
  const [editPlatform, setEditPlatform] = useState(null); // PlatformModal
  const [credFor, setCredFor] = useState(null);         // CredentialsModal (plateforme)

  /* Coffre : maître en mémoire uniquement */
  const [vault, setVault] = useState({ configured: false, unlocked: false, master: null });

  const dq = useDebounced(q, 250);

  const refresh = useCallback(async () => {
    const [ps, as, sn, vd, credIds] = await Promise.all([getPlatforms(), getActions(),
      fetch('/api/snapshot').then(r => r.json()).catch(() => null),
      fetch('/api/credentials').then(r => r.json()).catch(() => ({ configured: false })),
      fetch('/api/credentials?ids=1').then(r => r.json()).catch(() => [])
    ]);
    startTransition(() => {
      const withCreds = new Set(Array.isArray(credIds) ? credIds : []);
      setPlatforms(ps.map(p => ({ ...p, hasCreds: withCreds.has(p.id) }))); setActions(as);
      if (sn && sn.file) setSnap(sn.file);
      setVault(v => ({ ...v, configured: !!vd.configured }));
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh().catch(e => setFlash('Erreur chargement : ' + e.message)); }, [refresh]);

  const notify = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 2600); };
  const snapNow = () => postSnapshot().then(s => setSnap(s.file || '—')).catch(() => { });

  /* ---- Plateformes ---- */
  const patchP = (id, fields) => {
    setPlatforms(prev => prev.map(p => (p.id === id ? { ...p, ...fields } : p)));
    patchPlatform(id, fields).then(snapNow).catch(e => { notify('Erreur : ' + e.message); refresh(); });
  };
  const moveP = (id, status) => patchP(id, { status });
  const addP = (p) => postPlatform(p).then(() => refresh()).then(snapNow)
    .then(() => notify('Plateforme ajoutée ✔')).catch(e => notify('Erreur : ' + e.message));
  const saveP = (p) => {
    const isNew = !p.id;
    (isNew
      ? postPlatform({ name: p.name, url: p.url, cat: p.cat, note: p.note })
      : patchPlatform(p.id, { name: p.name, url: p.url, cat: p.cat, status: p.status, note: p.note, unote: p.unote, gain: p.gain })
    ).then(() => refresh()).then(snapNow)
      .then(() => notify(isNew ? 'Plateforme ajoutée ✔' : 'Enregistré ✔'))
      .catch(e => notify('Erreur : ' + e.message));
    setEditPlatform(null);
  };
  const removeP = (p) => {
    delPlatform(p.id).then(() => refresh()).then(snapNow).then(() => notify('Supprimée ✔'))
      .catch(e => notify('Erreur : ' + e.message));
    setEditPlatform(null);
  };

  /* ---- Actions (kanban) ---- */
  const moveA = (id, status) => {
    setActions(prev => prev.map(a => (a.id === id ? { ...a, status } : a)));
    patchAction(id, { status }).then(snapNow).catch(e => { notify('Erreur : ' + e.message); refresh(); });
  };
  const saveA = (a) => {
    const isNew = !a.id;
    (isNew ? postAction({ title: a.title, phase: a.phase, detail: a.detail })
          : patchAction(a.id, { title: a.title, detail: a.detail, phase: a.phase, status: a.status, unote: a.unote }))
      .then(() => refresh()).then(snapNow)
      .then(() => notify(isNew ? 'Action ajoutée ✔' : 'Action enregistrée ✔'))
      .catch(e => notify('Erreur : ' + e.message));
    setEditAction(null);
  };
  const removeA = (a) => {
    delAction(a.id).then(() => refresh()).then(snapNow).then(() => notify('Action supprimée'))
      .catch(e => notify('Erreur : ' + e.message));
    setEditAction(null);
  };

  /* ---- Stats ---- */
  const stats = useMemo(() => {
    if (!platforms) return null;
    const main = platforms.filter(p => p.cat !== 'bloquees');
    const s = { total: main.length, gain: 0 };
    Object.keys(P_STATUSES).forEach(k => { s[k] = main.filter(p => p.status === k).length; });
    s.gain = main.reduce((acc, p) => acc + (parseFloat(p.gain) || 0), 0);
    return s;
  }, [platforms]);

  const mainList = useMemo(() => {
    if (!platforms) return [];
    const needle = dq.trim().toLowerCase();
    return platforms.filter(p => {
      if (p.cat === 'bloquees') return false;
      if (filter !== 'all' && p.status !== filter) return false;
      if (cat !== 'all' && p.cat !== cat) return false;
      if (needle && !((p.name + ' ' + p.note + ' ' + p.unote).toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [platforms, filter, cat, dq]);

  const blockedList = useMemo(() => (platforms || []).filter(p => p.cat === 'bloquees'), [platforms]);

  const credsState = {
    configured: vault.configured,
    unlocked: vault.unlocked,
    master: vault.master,
    setMaster: (m, unlocked) => setVault(v => ({ ...v, master: m, unlocked })),
    lock: () => setVault(v => ({ ...v, master: null, unlocked: false }))
  };

  if (loading) return <div className="loading">Chargement de la base…</div>;

  return (
    <div>
      <header>
        <div className="headrow">
          <div>
            <h1>🇨🇬 Suivi Brazza</h1>
            <p className="sub">Next.js + SQLite · coffre-fort AES-256 · sauvegarde auto</p>
          </div>
          <div className="snap">
            💾 Dernier snapshot : <code>{snap}</code>
            {vault.configured && (
              <button className="btn ghost sm" onClick={credsState.lock} title="Verrouiller le coffre">
                {vault.unlocked ? '🔒 Verrouiller' : '🔐 Coffre'}
              </button>
            )}
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'platforms' ? 'active' : ''} onClick={() => setTab('platforms')}>🌐 Plateformes</button>
          <button className={tab === 'kanban' ? 'active' : ''} onClick={() => setTab('kanban')}>📋 Kanban</button>
          <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>📜 Règles d&apos;or</button>
        </nav>
      </header>

      {flash && <div className="flash">{flash}</div>}

      {tab === 'platforms' && (
        <main className="kb-main">
          <div className="chips">
            <span className="chip money">💰 {stats.gain} €/mois encaissés · {stats.avec_missions} avec missions · {stats.en_cours} en cours</span>
          </div>
          <PlatformKanban
            platforms={mainList}
            blocked={blockedList}
            q={q}
            setQ={setQ}
            onMove={moveP}
            onEdit={p => setEditPlatform(p)}
            onAdd={status => setEditPlatform({ id: null, status, cat: 'ia' })}
          />
        </main>
      )}

      {tab === 'kanban' && (
        <main className="kb-main">
          <Kanban
            actions={actions || []}
            onMove={moveA}
            onEdit={a => setEditAction(a)}
            onDelete={removeA}
            onAdd={status => setEditAction({ id: null, status, phase: 'p1' })}
          />
          <details className="addbox">
            <summary>📖 Vue par phase (légende)</summary>
            <p className="kb-legend">
              P1 = Installation · P2 = Formation &amp; évaluations · P3 = Croisière · P4 = Scale —
              le numéro sur chaque carte indique la phase ; change-la dans la modale d&apos;édition.
            </p>
          </details>
        </main>
      )}

      {tab === 'rules' && (
        <main className="rules">
          <div className="rule"><b>1 compte = 1 personne, jamais de compte partagé.</b><p>Vrai nom, email dédié et pièce d&apos;identité de chaque travailleur. Un compte partagé = bannissement de toute l&apos;équipe.</p></div>
          <div className="rule"><b>Pas de VPN sur les plateformes avec KYC / pièce d&apos;identité.</b><p>Outlier, Alignerr et similaires vérifient le pays. VPN résidentiel : uniquement plateformes sans KYC, à tes risques.</p></div>
          <div className="rule"><b>Toujours ≥ 3 sources actives par personne.</b><p>Une plateforme coupe sans prévenir. Trois sources actives = un revenu stable.</p></div>
          <div className="rule"><b>Le français écrit impeccable = la compétence n°1.</b><p>C&apos;est ce que les évaluations filtrent : zéro faute, consignes suivies, questions pièges « gold » respectées.</p></div>
          <div className="rule"><b>Lingala &amp; Kituba = votre avantage comparatif.</b><p>Peu de concurrents mondiaux sur ces données — nourrir la prospection B2B (Lelapa, Sigma, AfriData) en continu.</p></div>
          <div className="rule"><b>Tout est dans la base.</b><p>Chaque inscription, évaluation, gain — sinon impossible de savoir quoi scale et quoi couper.</p></div>
          <div className="secnote">🔐 Les mots de passe des plateformes sont chiffrés (AES-256-GCM) avec ton mot de passe maître — même toi tu ne peux les lire qu&apos;après déverrouillage. Le maître n&apos;est jamais stocké : ne le perds pas.</div>
        </main>
      )}

      <footer>
        <span className="note">Base : <code>data/suivi-brazza.db</code> · snapshots : <code>data/backups/</code> (40) · coffre : AES-256-GCM</span>
      </footer>

      {/* Modales */}
      {editAction && (
        <ActionModal
          action={editAction}
          onClose={() => setEditAction(null)}
          onSave={saveA}
          onDelete={editAction.id ? removeA : undefined}
        />
      )}
      {credFor && (
        <CredentialsModal
          platform={credFor}
          credsState={credsState}
          onClose={() => setCredFor(null)}
          onSaved={() => notify('Coffre mis à jour ✔')}
        />
      )}
    </div>
  );
}
