'use client';
import { useState } from 'react';
import { P_STATUSES, CAT_SHORT } from '../lib/kb.js';

/**
 * Kanban des plateformes : colonnes = 6 statuts, cartes groupées visuellement
 * par catégorie (badge). Drag & drop entre colonnes, clic → modale d'édition.
 * Les 12 plateformes « bloquées » restent en bas, à part (section repliable).
 */
export default function PlatformKanban({ platforms, onMove, onEdit, onAdd, blocked, q, setQ }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [showBlocked, setShowBlocked] = useState(false);

  const cols = Object.entries(P_STATUSES);

  const drop = (status, e) => {
    e.preventDefault();
    setOverCol(null);
    if (dragId) onMove(dragId, status);
    setDragId(null);
  };

  return (
    <div className="kb-wrap">
      <div className="toolbar">
        <input type="search" placeholder="🔎 Filtrer les cartes…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="kb-board kb-board-6">
        {cols.map(([sid, st]) => {
          const items = platforms.filter(p => p.status === sid);
          const isOver = overCol === sid;
          return (
            <div
              key={sid}
              className={'kb-col' + (isOver ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); setOverCol(sid); }}
              onDragLeave={() => setOverCol(c => (c === sid ? null : c))}
              onDrop={e => drop(sid, e)}
            >
              <div className="kb-col-head">
                <button
                  className="kb-fold" onClick={() => setCollapsed(c => ({ ...c, [sid]: !c[sid] }))}
                  title={collapsed[sid] ? 'Déplier' : 'Replier'}
                >{collapsed[sid] ? '▸' : '▾'}</button>
                <span className="kb-col-title" style={{ background: st.bg, color: st.fg }}>{st.short}</span>
                <span className="kb-count">{items.length}</span>
              </div>

              {!collapsed[sid] && (
                <>
                  {items.map(p => (
                    <div
                      key={p.id}
                      className={'kb-card' + (dragId === p.id ? ' dragging' : '')}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => onEdit(p)}
                    >
                      <div className="kb-card-top">
                        <span className="kb-cat" data-cat={p.cat}>{CAT_SHORT[p.cat] || p.cat}</span>
                        <span className="kb-gain">{p.gain ? p.gain + ' €' : ''}</span>
                      </div>
                      <div className="kb-title">{p.name}</div>
                      {p.unote && <div className="kb-unote">📝 {p.unote}</div>}
                      {p.hasCreds && <div className="kb-vault">🔐 identifiants</div>}
                    </div>
                  ))}
                  <button className="kb-add" onClick={() => onAdd(sid)}>＋</button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <details className="blk">
        <summary onClick={() => setShowBlocked(!showBlocked)}>
          ❌ À éviter — fermées ou bloquées pour le Congo ({blocked.length})
        </summary>
        {blocked.map(p => (
          <div className="blkrow" key={p.id}>
            <span className="bn">{p.name}</span>
            <span className="br">{p.note}</span>
          </div>
        ))}
      </details>
    </div>
  );
}
