'use client';
import { useState, useEffect } from 'react';

/**
 * Coffre-fort d'identifiants d'une plateforme.
 * - Si le coffre n'existe pas encore : écran de création du mot de passe maître.
 * - Sinon : demande le maître (session), puis affiche / édite login, identifiant,
 *   mot de passe (chiffré AES-256-GCM côté serveur), notes.
 * Le maître vit uniquement en mémoire du composant + header x-master.
 */
export default function CredentialsModal({ platform, onClose, credsState, onSaved }) {
  const { configured, unlocked, master, setMaster: setGlobalMaster, lock } = credsState;
  const [masterInput, setMasterInput] = useState('');
  const [master2, setMaster2] = useState('');
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);   // { login_url, username, password, cnote } | null
  const [show, setShow] = useState(false);  // afficher le mot de passe en clair
  const [busy, setBusy] = useState(false);

  const api = async (path, opts = {}) => {
    const r = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(master ? { 'x-master': master } : {}), ...(opts.headers || {}) }
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  };

  const loadEntry = async (m) => {
    setErr('');
    const j = await api('/api/credentials?platform=' + encodeURIComponent(platform.id), {
      headers: { 'x-master': m }
    });
    setData(j || { login_url: platform.url || '', username: '', password: '', cnote: '' });
  };

  useEffect(() => {
    if (configured && unlocked && master) loadEntry(master).catch(e => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, unlocked]);

  /* ---- 1. Premier lancement : créer le maître ---- */
  if (!configured) {
    return (
      <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-head">
            <h3>🔐 Créer le coffre-fort</h3>
            <button className="modal-x" onClick={onClose}>✕</button>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setErr('');
            if (masterInput.length < 6) return setErr('6 caractères minimum.');
            if (masterInput !== master2) return setErr('Les deux mots de passe diffèrent.');
            setBusy(true);
            try {
              await api('/api/credentials', { method: 'POST', body: JSON.stringify({ master: masterInput }) });
              setGlobalMaster(masterInput, true);
              await loadEntry(masterInput);
            } catch (ex) { setErr(ex.message); }
            setBusy(false);
          }}>
            <p className="vault-hint">
              Ce mot de passe maître chiffre (AES-256-GCM) tous les identifiants des plateformes.
              Il n&apos;est stocké nulle part. <b>Si tu le perds, tout est irrécupérable.</b> Garde-le toi seul.
            </p>
            <label>
              Mot de passe maître
              <input type="password" autoFocus value={masterInput} onChange={e => setMasterInput(e.target.value)} />
            </label>
            <label>
              Confirmer
              <input type="password" value={master2} onChange={e => setMaster2(e.target.value)} />
            </label>
            {err && <p className="vault-err">{err}</p>}
            <div className="modal-foot">
              <span />
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={onClose}>Plus tard</button>
                <button className="btn" disabled={busy} type="submit">Chiffrer &amp; créer</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ---- 2. Coffre verrouillé : demander le maître ---- */
  if (!unlocked) {
    return (
      <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-head">
            <h3>🔐 Coffre-fort — {platform.name}</h3>
            <button className="modal-x" onClick={onClose}>✕</button>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setErr(''); setBusy(true);
            try {
              await loadEntry(masterInput);        // 401 si maître invalide
              setGlobalMaster(masterInput, true);
            } catch (ex) {
              setErr(ex.message.includes('invalide') ? 'Mot de passe maître incorrect.' : ex.message);
            }
            setBusy(false);
          }}>
            <label>
              Mot de passe maître
              <input type="password" autoFocus value={masterInput} onChange={e => setMasterInput(e.target.value)} />
            </label>
            {err && <p className="vault-err">{err}</p>}
            <div className="modal-foot">
              <span />
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
                <button className="btn" disabled={busy} type="submit">Déverrouiller</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ---- 3. Déverrouillé : éditer l'entrée ---- */
  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api('/api/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          platformId: platform.id,
          loginUrl: data.login_url, username: data.username,
          password: data.password, cnote: data.cnote
        })
      });
      onSaved && onSaved();
      onClose();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>🔐 {platform.name}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn ghost sm" onClick={lock} title="Verrouiller le coffre">🔒 Verrouiller</button>
            <button className="modal-x" onClick={onClose}>✕</button>
          </div>
        </div>
        {data === null ? <p className="vault-hint">Chargement…</p> : (
          <form onSubmit={save}>
            <label>
              Lien de connexion
              <input value={data.login_url || ''} onChange={e => setData({ ...data, login_url: e.target.value })} placeholder="https://…/login" />
            </label>
            <label>
              Identifiant / email
              <input value={data.username || ''} onChange={e => setData({ ...data, username: e.target.value })} placeholder="email ou pseudo" />
            </label>
            <label>
              Mot de passe
              <span className="pwrow">
                <input
                  type={show ? 'text' : 'password'}
                  value={data.password || ''}
                  onChange={e => setData({ ...data, password: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="off"
                />
                <button type="button" className="btn ghost sm" onClick={() => setShow(!show)}>{show ? '🙈' : '👁'}</button>
                <button
                  type="button" className="btn ghost sm" title="Copier"
                  onClick={() => navigator.clipboard.writeText(data.password || '').then(() => { })}
                >📋</button>
              </span>
            </label>
            <label>
              Notes (code 2FA, email de récup, question secrète…)
              <textarea rows={2} value={data.cnote || ''} onChange={e => setData({ ...data, cnote: e.target.value })} />
            </label>
            {err && <p className="vault-err">{err}</p>}
            <div className="modal-foot">
              <button
                type="button" className="modal-del"
                onClick={async () => {
                  if (!window.confirm('Effacer les identifiants de ' + platform.name + ' ?')) return;
                  await api('/api/credentials?platform=' + encodeURIComponent(platform.id), { method: 'DELETE' });
                  onSaved && onSaved(); onClose();
                }}
              >🗑 Effacer</button>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
                <button className="btn" disabled={busy} type="submit">Enregistrer</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
