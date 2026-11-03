'use client';
import { useEffect, useMemo, useState } from 'react';
import { CATS, CONGO_STATUSES, HIDDEN_CAT } from '../lib/kb.js';

const CAT_LABEL = Object.fromEntries(CATS.map(c => [c.id, c.label]));

/**
 * Choix des sites autorisés pour un membre (admin).
 * Décocher un site le masque de son kanban ; ses notes/statuts sont conservés.
 */
export default function UserPlatformsModal({ user, onClose, onSaved }) {
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/users/platforms?user=' + encodeURIComponent(user.id))
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      })
      .then(j => {
        if (!alive) return;
        setRows(j.platforms);
        setSel(new Set(j.platforms.filter(p => p.allowed === 1).map(p => p.id)));
      })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [user.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(p => (p.name + ' ' + (CAT_LABEL[p.cat] || '')).toLowerCase().includes(needle));
  }, [rows, q]);

  const toggle = (id) => setSel(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectAll = () => setSel(new Set((rows || []).map(p => p.id)));
  const selectNone = () => setSel(new Set());
  const selectActive = () => setSel(new Set((rows || []).filter(p => p.cat !== HIDDEN_CAT).map(p => p.id)));
  const selectCongo = () => setSel(new Set((rows || []).filter(p => p.congo === 'ok').map(p => p.id)));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/users/platforms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, platformIds: [...sel] })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      onSaved && onSaved(j);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const activeCount = (rows || []).filter(p => p.cat !== HIDDEN_CAT).length;
  const allowedActive = (rows || []).filter(p => p.cat !== HIDDEN_CAT && sel.has(p.id)).length;

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal upm" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>🌐 Sites de {user.name}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <p className="upm-intro">
          Coche les sites que <b>{user.name}</b> peut voir et utiliser. Les sites décochés
          disparaissent de son kanban — ses notes, statuts et gains sont conservés.
        </p>

        <div className="upm-tools">
          <input type="search" placeholder="🔎 Filtrer…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="upm-bulk">
            <button type="button" className="btn ghost sm" onClick={selectAll}>Tout</button>
            <button type="button" className="btn ghost sm" onClick={selectNone}>Rien</button>
            <button type="button" className="btn ghost sm" onClick={selectActive}>Actifs</button>
            <button type="button" className="btn ghost sm" onClick={selectCongo}>🇨🇬 OK</button>
          </div>
        </div>

        <div className="upm-list">
          {!rows && !err && <p className="kb-hint">Chargement…</p>}
          {err && <div className="auth-error">{err}</div>}
          {filtered.map(p => (
            <label className={'upm-row' + (p.cat === HIDDEN_CAT ? ' off' : '')} key={p.id}>
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="upm-name">{p.name}</span>
              <span className="upm-tags">
                <span className="upm-cat">{CAT_LABEL[p.cat] || p.cat}</span>
                {p.congo !== 'ok' && (
                  <span className="upm-congo" style={{ background: CONGO_STATUSES[p.congo]?.bg, color: CONGO_STATUSES[p.congo]?.fg }}>
                    🇨🇬 {CONGO_STATUSES[p.congo]?.label || p.congo}
                  </span>
                )}
              </span>
            </label>
          ))}
          {rows && filtered.length === 0 && <p className="kb-hint">Aucun site ne correspond.</p>}
        </div>

        <div className="modal-foot">
          <span className="upm-count">
            <b>{allowedActive}</b> / {activeCount} sites actifs autorisés
            {sel.size !== allowedActive ? ` · ${sel.size} au total` : ''}
          </span>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="button" className="btn" disabled={busy || !rows} onClick={save}>
              {busy ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
