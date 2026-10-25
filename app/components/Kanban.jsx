'use client';
import { useState } from 'react';
import { A_STATUSES } from '../lib/kb.js';

/**
 * Kanban Trello-like : colonnes = statuts, cartes = actions groupées par phase.
 * Déplacement : drag & drop natif entre colonnes (+ boutons ← → pour mobile).
 * Clic sur une carte → modale d'édition (gérée par le parent via onEdit).
 * Ajout rapide en bas de chaque colonne.
 */
export default function Kanban({ actions, onMove, onEdit, onDelete, onAdd }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const cols = [
    { id: 'a_faire', label: 'À faire' },
    { id: 'en_cours', label: 'En cours' },
    { id: 'fait', label: 'Fait ✔' }
  ];

  const drop = (status, e) => {
    e.preventDefault();
    setOverCol(null);
    if (dragId) onMove(dragId, status);
    setDragId(null);
  };

  return (
    <div className="kb-wrap">
      <div className="kb-board">
        {cols.map(col => {
          const items = actions.filter(a => a.status === col.id);
          const isOver = overCol === col.id;
          return (
            <div
              key={col.id}
              className={'kb-col' + (isOver ? ' over' : '')}
              onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
              onDragLeave={() => setOverCol(c => (c === col.id ? null : c))}
              onDrop={e => drop(col.id, e)}
            >
              <div className="kb-col-head">
                <button
                  className="kb-fold"
                  onClick={() => setCollapsed(c => ({ ...c, [col.id]: !c[col.id] }))}
                  title={collapsed[col.id] ? 'Déplier' : 'Replier'}
                >{collapsed[col.id] ? '▸' : '▾'}</button>
                <span className="kb-col-title" style={{ background: A_STATUSES[col.id].bg, color: A_STATUSES[col.id].fg }}>
                  {col.label}
                </span>
                <span className="kb-count">{items.length}</span>
              </div>

              {!collapsed[col.id] && (
                <>
                  {items.map(a => (
                    <div
                      key={a.id}
                      className={'kb-card' + (a.status === 'fait' ? ' done' : '') + (dragId === a.id ? ' dragging' : '')}
                      draggable
                      onDragStart={() => setDragId(a.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => onEdit(a)}
                    >
                      <div className="kb-card-top">
                        <span className="kb-phase">{a.phase.toUpperCase()}</span>
                        <div className="kb-move" onClick={e => e.stopPropagation()}>
                          {col.id !== 'a_faire' && (
                            <button title="← À faire" onClick={() => onMove(a.id, 'a_faire')}>←</button>
                          )}
                          {col.id !== 'fait' && (
                            <button title="Fait →" onClick={() => onMove(a.id, 'fait')}>→</button>
                          )}
                          {col.id === 'a_faire' && (
                            <button title="En cours →" onClick={() => onMove(a.id, 'en_cours')}>→</button>
                          )}
                        </div>
                      </div>
                      <div className="kb-title">{a.title}</div>
                      {a.detail && <div className="kb-detail">{a.detail}</div>}
                      {a.unote && <div className="kb-unote">📝 {a.unote}</div>}
                    </div>
                  ))}

                  <button className="kb-add" onClick={() => onAdd(col.id)}>＋ Ajouter</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="kb-hint">💡 Glisse-dépose les cartes · clic pour éditer · ← → pour mobile</p>
    </div>
  );
}
