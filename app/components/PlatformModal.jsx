'use client';
import { useState, useEffect } from 'react';
import { P_STATUSES, CATS, CONGO_STATUSES, HIDDEN_CAT, parseGain } from '../lib/kb.js';

/**
 * Modale d'édition d'une plateforme : statut, catégorie, URL, note officielle,
 * notes perso, €/mois, identifiants (bouton 🔐 → CredentialsModal du parent).
 */
export default function PlatformModal({ platform, onClose, onSave, onDelete, onCreds, canDelete = true, canEditCatalog = true }) {
  const isNew = !platform.id;
  const catalogLocked = !isNew && !canEditCatalog;
  const [name, setName] = useState(platform.name || '');
  const [url, setUrl] = useState(platform.url || '');
  const [cat, setCat] = useState(platform.cat || 'ia');
  const [status, setStatus] = useState(platform.status || 'pas_inscrit');
  const [congo, setCongo] = useState(platform.congo || (platform.cat === HIDDEN_CAT ? 'non' : 'ok'));
  const [note, setNote] = useState(platform.note || '');
  const [unote, setUnote] = useState(platform.unote || '');
  const [gain, setGain] = useState(platform.gain || '');
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setErr('');
    const rawGain = String(gain ?? '').trim();
    /* même règle que le serveur : une virgule décimale est acceptée, le reste non */
    if (rawGain && parseGain(rawGain) === 0 && !/^[-+]?0*(?:[.,]0+)?$/.test(rawGain)) {
      setErr('Gain invalide : indique un nombre (ex : 12,50).');
      return;
    }
    onSave({
      ...platform,
      name: name.trim(), url: url.trim(), cat, status, congo, note: note.trim(),
      unote: unote.trim(), gain: rawGain ? String(parseGain(rawGain)) : ''
    });
  };

  const st = P_STATUSES[status] || P_STATUSES.pas_inscrit;
  const cg = CONGO_STATUSES[congo] || CONGO_STATUSES.ok;

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{isNew ? '＋ Nouvelle plateforme' : '🌐 ' + platform.name}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <form onSubmit={submit}>
          <label>
            Nom
            <input required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Mindrift" disabled={catalogLocked} />
          </label>
          <label>
            Lien
            <span className="pwrow">
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" disabled={catalogLocked} />
              {url && (
                <a className="btn ghost sm" target="_blank" rel="noopener noreferrer" href={url} title="Ouvrir le site">↗</a>
              )}
            </span>
          </label>
          <div className="modal-cols">
            <label>
              Catégorie
              <select value={cat} onChange={e => setCat(e.target.value)} disabled={catalogLocked}>
                {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label>
              Statut
              <select value={status} onChange={e => setStatus(e.target.value)} style={{ background: st.bg, color: st.fg, fontWeight: 700 }}>
                {Object.entries(P_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label>
            Inscription depuis le Congo
            <select value={congo} onChange={e => setCongo(e.target.value)} disabled={catalogLocked} style={{ background: cg.bg, color: cg.fg, fontWeight: 700 }}>
              {Object.entries(CONGO_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <label>
            €/mois encaissé le mois dernier
            <input type="number" min="0" step="0.01" value={gain} onChange={e => setGain(e.target.value)} placeholder="0" />
          </label>
          <label>
            Note officielle (tarifs, conditions…)
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} disabled={catalogLocked} />
          </label>
          <label>
            Tes notes perso
            <textarea rows={2} value={unote} onChange={e => setUnote(e.target.value)} placeholder="Date d'inscription, évaluations passées…" />
          </label>
          <div className="modal-foot">
          {err && <p className="vault-err" style={{ width: '100%' }}>{err}</p>}
          {!isNew
            ? <div className="modal-foot-left">
                {onCreds && <button type="button" className="vaultbtn big" onClick={() => onCreds(platform)}>🔐 Identifiants</button>}
                {canDelete && (
                  <button
                    type="button" className="modal-del"
                    onClick={() => { if (window.confirm('Supprimer ' + platform.name + ' ?\nElle disparaîtra pour TOUT LE MONDE.')) onDelete(platform); }}
                  >🗑</button>
                )}
              </div>
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
