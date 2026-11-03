'use client';
import { useCallback, useEffect, useState } from 'react';
import { P_STATUSES } from '../lib/kb.js';
import UserPlatformsModal from './UserPlatformsModal.jsx';

/**
 * Onglet « Équipe » (admin) : avancement de chaque personne + gestion des accès.
 * L'ouverture d'un tableau se fait en lecture seule.
 */
export default function Team({ me, onOpenBoard }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null); // { name, code } affiché une seule fois
  const [sitesFor, setSitesFor] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch('/api/users');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      setUsers(j);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notify = (m) => { setFlash(m); setTimeout(() => setFlash(''), 2800); };

  const api = async (path, opts) => {
    const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const j = await api('/api/users', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setFresh({ name: j.user.name, code: j.code });
      setName('');
      await load();
      notify('Utilisateur créé ✔');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  const resetCode = async (u) => {
    if (!window.confirm('Générer un nouveau code pour ' + u.name + ' ?\nSon ancien code ne fonctionnera plus.')) return;
    try {
      const j = await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, resetCode: true }) });
      setFresh({ name: u.name, code: j.code });
      notify('Nouveau code généré ✔');
    } catch (e) { setErr(e.message); }
  };

  const rename = async (u) => {
    const n = window.prompt('Nouveau nom pour ' + u.name + ' :', u.name);
    if (!n || n.trim() === u.name) return;
    try {
      await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, name: n.trim() }) });
      await load();
      notify('Nom modifié ✔');
    } catch (e) { setErr(e.message); }
  };

  const remove = async (u) => {
    if (!window.confirm('Supprimer ' + u.name + ' et tout son tableau ?\nCette action est définitive.')) return;
    try {
      await api('/api/users?id=' + encodeURIComponent(u.id), { method: 'DELETE' });
      await load();
      notify('Utilisateur supprimé');
    } catch (e) { setErr(e.message); }
  };

  if (!users) return <main className="kb-main"><p className="kb-hint">{err || 'Chargement de l\'équipe…'}</p></main>;

  return (
    <main className="kb-main team">
      <div className="team-head">
        <h2>👥 Équipe</h2>
        <form className="team-add" onSubmit={addUser}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du nouvel utilisateur" />
          <button className="btn" disabled={busy || !name.trim()}>{busy ? '…' : '＋ Créer'}</button>
        </form>
      </div>

      <p className="team-hint">
        🌐 <b>Sites</b> : choisis les plateformes visibles par chaque personne. Un site décoché
        disparaît de son kanban — ses notes, statuts et gains sont conservés.
      </p>

      {flash && <div className="flash">{flash}</div>}
      {err && <div className="auth-error">{err}</div>}

      {fresh && (
        <div className="code-once">
          <div>
            Code d'accès de <b>{fresh.name}</b> : <code>{fresh.code}</code>
            <div className="code-warn">Note-le maintenant : il ne sera plus affiché.</div>
          </div>
          <button className="btn ghost sm" onClick={() => setFresh(null)}>J'ai noté</button>
        </div>
      )}

      <div className="team-grid">
        {users.map(u => {
          const s = u.stats || {};
          return (
            <div className="team-card" key={u.id}>
              <div className="team-card-head">
                <b>{u.name}</b>
                {u.role === 'admin' && <span className="role-badge">admin</span>}
                {u.id === me.id && <span className="me-badge">toi</span>}
              </div>
              <div className="team-stats">
                {Object.entries(P_STATUSES).map(([k, st]) =>
                  s[k] ? <span key={k} className="team-stat" style={{ background: st.bg, color: st.fg }}>{st.short} · {s[k]}</span> : null
                )}
                {!Object.keys(P_STATUSES).some(k => s[k]) && <span className="kb-hint">Rien de suivi pour l'instant</span>}
              </div>
              <div className="team-meta">
                💰 {s.gain || 0} €/mois · {u.tracked} plateforme(s) suivie(s)
                {' · '}🌐 {u.allowed_count}/{u.total_count} sites
                {u.last_update ? ' · maj ' + u.last_update : ''}
              </div>
              <div className="team-actions">
                <button className="btn ghost sm" onClick={() => onOpenBoard(u)}>📋 Voir son kanban</button>
                {u.role !== 'admin' && (
                  <button className="btn ghost sm" onClick={() => setSitesFor(u)} title="Choisir les sites autorisés">🌐 Sites</button>
                )}
                <button className="btn ghost sm" onClick={() => resetCode(u)} title="Générer un nouveau code">🔑 Code</button>
                <button className="btn ghost sm" onClick={() => rename(u)} title="Renommer">✏️</button>
                {u.id !== me.id && (
                  <button className="btn ghost sm danger" onClick={() => remove(u)} title="Supprimer">🗑</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sitesFor && (
        <UserPlatformsModal
          user={sitesFor}
          onClose={() => setSitesFor(null)}
          onSaved={(c) => {
            setSitesFor(null);
            load();
            notify(c && typeof c.allowed === 'number' ? `${c.allowed} site(s) autorisé(s) ✔` : 'Sites mis à jour ✔');
          }}
        />
      )}
    </main>
  );
}
