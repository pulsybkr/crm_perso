'use client';

import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import Kanban from './components/Kanban.jsx';
import ActionModal from './components/ActionModal.jsx';
import CredentialsModal from './components/CredentialsModal.jsx';
import { P_STATUSES, A_STATUSES } from './lib/kb.js';

/* ================= Constantes ================= */
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
  const [credFor, setCredFor] = useState(null);         // CredentialsModal (plateforme)

  /* Coffre : maître en mémoire uniquement */
  const [vault, setVault] = useState({ configured: false, unlocked: false, master: null });

  const dq = useDebounced(q, 250);

  const refresh = useCallback(async () => {
    const [ps, as, sn, vd] = await Promise.all([getPlatforms(), getActions(),
      fetch('/api/snapshot').then(r => r.json()).catch(() => null),
      fetch('/api/credentials').then(r => r.json()).catch(() => ({ configured: false }))
    ]);
    startTransition(() => {
      setPlatforms(ps); setActions(as);
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
  const addP = (p) => postPlatform(p).then(() => refresh()).then(snapNow)
    .then(() => notify('Plateforme ajoutée ✔')).catch(e => notify('Erreur : ' + e.message));
  const removeP = (id) => {
    if (!window.confirm('Supprimer cette plateforme ?')) return;
    delPlatform(id).then(() => refresh()).then(() => notify('Supprimée ✔')).catch(e => notify('Erreur : ' + e.message));
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
        <main>
          <div className="chips">
            <button className={'chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
              Toutes · {stats.total}
            </button>
            {Object.entries(P_STATUSES).map(([k, st]) => (
              <button key={k} className={'chip' + (filter === k ? ' active' : '')} onClick={() => setFilter(filter === k ? 'all' : k)}>
                <span className="dot" style={{ background: st.bg }} /> {st.short} · {stats[k]}
              </button>
            ))}
            <span className="chip money">💰 {stats.gain} €/mois encaissés</span>
          </div>

          <div className="toolbar">
            <input type="search" placeholder="🔎 Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
            <select value={cat} onChange={e => setCat(e.target.value)}>
              <option value="all">Toutes les catégories</option>
              {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <AddPlatform onAdd={addP} />

          {CATS.map(c => {
            const items = mainList.filter(p => p.cat === c.id);
            if (!items.length) return null;
            return (
              <section className="catsec" key={c.id}>
                <h2>{c.label} <span className="cnt">· {items.length}</span></h2>
                {items.map(p => (
                  <article className="card" key={p.id}>
                    <div className="row1">
                      <span className="pnrow">
                        {p.url
                          ? <a className="pname" target="_blank" rel="noopener noreferrer" href={p.url}>{p.name} ↗</a>
                          : <span className="pname">{p.name}</span>}
                        <button className="vaultbtn" onClick={() => setCredFor(p)} title="Identifiants (coffre-fort)">🔐</button>
                      </span>
                      <select
                        className="stsel"
                        value={p.status}
                        style={{ background: P_STATUSES[p.status].bg, color: P_STATUSES[p.status].fg }}
                        onChange={e => patchP(p.id, { status: e.target.value })}
                      >
                        {Object.entries(P_STATUSES).map(([k, st]) =>
                          <option key={k} value={k}>{st.label}</option>)}
                      </select>
                    </div>
                    {p.note && <p className="pnote">{p.note}</p>}
                    <div className="row2">
                      <input
                        className="unote" placeholder="Tes notes (date d'inscription…)"
                        defaultValue={p.unote}
                        onBlur={e => { if (e.target.value !== p.unote) patchP(p.id, { unote: e.target.value }); }}
                      />
                      <input
                        className="gain" type="number" min="0" placeholder="€/mois" title="Gains réels encaissés le mois dernier"
                        defaultValue={p.gain}
                        onBlur={e => { if (e.target.value !== p.gain) patchP(p.id, { gain: e.target.value }); }}
                      />
                      <button className="del" onClick={() => removeP(p.id)} title="Supprimer">✕</button>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
          {!mainList.length && <p className="empty">Aucune plateforme ne correspond au filtre.</p>}

          {blockedList.length > 0 && (
            <details className="blk">
              <summary>❌ À éviter — fermées ou bloquées pour le Congo ({blockedList.length})</summary>
              {blockedList.map(p => (
                <div className="blkrow" key={p.id}>
                  <span className="bn">{p.name}</span>
                  <span className="br">{p.note}</span>
                </div>
              ))}
            </details>
          )}
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

/* ================= Sous-composants ================= */
function AddPlatform({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [cat, setCat] = useState('ia');
  const [note, setNote] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), url: url.trim(), cat, note: note.trim() });
    setName(''); setUrl(''); setNote(''); setOpen(false);
  };

  return (
    <details className="addbox" open={open} onToggle={e => setOpen(e.target.open)}>
      <summary>＋ Ajouter une plateforme</summary>
      <form onSubmit={submit}>
        <input required placeholder="Nom" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="URL (https://…)" value={url} onChange={e => setUrl(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)}>
          {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input placeholder="Note (tarif, conditions…)" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn" type="submit">Ajouter</button>
      </form>
    </details>
  );
}
