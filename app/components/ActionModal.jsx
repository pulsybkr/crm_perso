'use client';
import { useState, useEffect } from 'react';

/**
 * Modale plein écran : édition d'une action (titre, détail, phase, statut, notes)
 * ou création. Utilisée par le kanban. Fermeture : Échap / clic fond / bouton.
 */
export default function ActionModal({ action, onClose, onSave, onDelete }) {
  const isNew = !action.id;
  const [title, setTitle] = useState(action.title || '');
  const [detail, setDetail] = useState(action.detail || '');
  const [phase, setPhase] = useState(action.phase || 'p1');
  const [status, setStatus] = useState(action.status || 'a_faire');
  const [unote, setUnote] = useState(action.unote || '');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ ...action, title: title.trim(), detail: detail.trim(), phase, status, unote: unote.trim() });
  };

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{isNew ? '＋ Nouvelle action' : '✏️ ' + action.title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <form onSubmit={submit}>
          <label>
            Action
            <input required autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : S'inscrire sur Mindrift" />
          </label>
          <label>
            Détail
            <textarea rows={2} value={detail} onChange={e => setDetail(e.target.value)} placeholder="Précisions, sous-étapes, lien…" />
          </label>
          <div className="modal-cols">
            <label>
              Phase
              <select value={phase} onChange={e => setPhase(e.target.value)}>
                <option value="p1">Phase 1 · Installation</option>
                <option value="p2">Phase 2 · Formation</option>
                <option value="p3">Phase 3 · Croisière</option>
                <option value="p4">Phase 4 · Scale</option>
              </select>
            </label>
            <label>
              Statut
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="a_faire">À faire</option>
                <option value="en_cours">En cours</option>
                <option value="fait">Fait ✔</option>
              </select>
            </label>
          </div>
          <label>
            Tes notes
            <textarea rows={2} value={unote} onChange={e => setUnote(e.target.value)} placeholder="Avancement, blocages…" />
          </label>
          <div className="modal-foot">
            {!isNew && onDelete
              ? <button type="button" className="modal-del" onClick={() => { if (window.confirm('Supprimer cette action ?')) onDelete(action); }}>🗑 Supprimer</button>
              : <span />}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn">Enregistrer</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
