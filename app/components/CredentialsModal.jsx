'use client';
import { useState, useEffect } from 'react';

/**
 * Coffre-fort multi-comptes d'une plateforme.
 * - 1er lancement : créer le mot de passe maître.
 * - Sinon : déverrouiller avec le maître, puis liste des comptes :
 *   label, email/identifiant, mot de passe (chiffré AES-256-GCM côté serveur), notes.
 *   Ajouter / modifier / supprimer un compte, + lien de connexion de la plateforme.
 */
export default function CredentialsModal({ platform, onClose, credsState, onSaved }) {
  const { configured, unlocked, master, setMaster: setGlobalMaster, lock } = credsState;
  const [masterInput, setMasterInput] = useState('');
  const [master2, setMaster2] = useState('');
  const [err, setErr] = useState('');
  const [loginUrl, setLoginUrl] = useState(platform.login_url || platform.url || '');
  const [accounts, setAccounts] = useState(null);   // [{ id, label, username, password, cnote }]
  const [editing, setEditing] = useState(null);     // {} nouveau | { ...compte existant }
  const [show, setShow] = useState({});              // id → bool
  const [busy, setBusy] = useState(false);

  const api = async (path, opts = {}) => {
    const r = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(master ? { 'x-master': master } : {}),
        ...(opts.headers || {})
      }
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  };

  const load = async (m) => {
    setErr('');
    const list = await api('/api/credentials?platform=' + encodeURIComponent(platform.id), {
      headers: { 'x-master': m }
    });
    setAccounts(list);
  };

  useEffect(() => {
    if (configured && unlocked && master) load(master).catch(e => setErr(e.message));
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
              await load(masterInput);
            } catch (ex) { setErr(ex.message); }
            setBusy(false);
          }}>
            <p className="vault-hint">
              Ce mot de passe maître chiffre (AES-256-GCM) tous les identifiants.
              Il n&apos;est stocké nulle part. <b>Si tu le perds, tout est irrécupérable.</b>
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

  /* ---- 2. Verrouillé : demander le maître ---- */
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
              await load(masterInput);
              setGlobalMaster(masterInput, true);
            } catch (ex) {
              setErr(ex.message.includes('invalide') || ex.message.includes('423') ? 'Mot de passe maître incorrect.' : ex.message);
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

  /* ---- 3. Déverrouillé : gestion des comptes ---- */
  const saveAccount = async (a) => {
    setErr(''); setBusy(true);
    try {
      await api('/api/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          platformId: platform.id, loginUrl,
          id: a.id || undefined,
          label: a.label, username: a.username,
          password: a.password, cnote: a.cnote
        })
      });
      await load(master);
      setEditing(null);
      onSaved && onSaved();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  const delAccount = async (a) => {
    if (!window.confirm('Supprimer le compte « ' + (a.label || a.username) + ' » ?')) return;
    await api('/api/credentials?account=' + encodeURIComponent(a.id), { method: 'DELETE' });
    await load(master);
    onSaved && onSaved();
  };

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>🔐 Comptes — {platform.name}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn ghost sm" onClick={lock}>🔒 Verrouiller</button>
            <button className="modal-x" onClick={onClose}>✕</button>
          </div>
        </div>

        {accounts === null ? <p className="vault-hint">Chargement…</p> : (
          <>
            <label>
              🔗 Lien de connexion
              <span className="pwrow">
                <input value={loginUrl} onChange={e => setLoginUrl(e.target.value)} placeholder="https://…/login" />
                {loginUrl && (
                  <a className="btn ghost sm" target="_blank" rel="noopener noreferrer" href={loginUrl} title="Ouvrir la page de connexion">↗</a>
                )}
              </span>
            </label>
            <button
              className="btn ghost sm" style={{ marginBottom: 12 }}
              onClick={async () => {
                setErr(''); setBusy(true);
                try {
                  await api('/api/credentials', { method: 'PUT', body: JSON.stringify({ platformId: platform.id, loginUrl }) });
                  onSaved && onSaved();
                } catch (ex) { setErr(ex.message); }
                setBusy(false);
              }}
            >💾 Enregistrer le lien</button>

            <div className="acct-list">
              {accounts.map(a => (
                <div key={a.id} className="acct">
                  {editing && editing.id === a.id ? (
                    <AccountForm initial={a} onSave={saveAccount} onCancel={() => setEditing(null)} busy={busy} />
                  ) : (
                    <>
                      <div className="acct-line">
                        <b className="acct-label">{a.label || 'Compte'}</b>
                        <code className="acct-user">{a.username}</code>
                        <span className="pwrow">
                          <input
                            readOnly
                            type={show[a.id] ? 'text' : 'password'}
                            value={a.password}
                            className="acct-pw"
                          />
                          <button className="btn ghost sm" onClick={() => setShow(s => ({ ...s, [a.id]: !s[a.id] }))}>
                            {show[a.id] ? '🙈' : '👁'}
                          </button>
                          <button className="btn ghost sm" title="Copier le mot de passe"
                            onClick={() => navigator.clipboard.writeText(a.password)}>📋</button>
                        </span>
                        <button className="btn ghost sm" onClick={() => setEditing(a)}>✏️</button>
                        <button className="btn ghost sm" onClick={() => delAccount(a)}>🗑</button>
                      </div>
                      {a.cnote && <div className="acct-note">📝 {a.cnote}</div>}
                    </>
                  )}
                </div>
              ))}
              {!accounts.length && <p className="vault-hint">Aucun compte pour l&apos;instant — ajoute le premier 👇</p>}
            </div>

            {editing && !editing.id ? (
              <AccountForm initial={editing} onSave={saveAccount} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <button className="kb-add" onClick={() => setEditing({ label: '', username: '', password: '', cnote: '' })}>
                ＋ Ajouter un compte
              </button>
            )}
            {err && <p className="vault-err">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/* Formulaire d'un compte (création / édition) */
function AccountForm({ initial, onSave, onCancel, busy }) {
  const [label, setLabel] = useState(initial.label || '');
  const [username, setUsername] = useState(initial.username || '');
  const [password, setPassword] = useState(initial.password || '');
  const [cnote, setCnote] = useState(initial.cnote || '');

  return (
    <div className="acct-form">
      <div className="modal-cols">
        <label>
          Nom du compte
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Moi / Pote 1" autoFocus />
        </label>
        <label>
          Email / identifiant
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="email@…" />
        </label>
      </div>
      <label>
        Mot de passe
        <span className="pwrow">
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="off" />
          <button
            type="button" className="btn ghost sm" title="Générer un mot de passe fort"
            onClick={() => {
              const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
              const arr = crypto.getRandomValues(new Uint32Array(18));
              setPassword(Array.from(arr, x => chars[x % chars.length]).join(''));
            }}
          >🎲</button>
        </span>
      </label>
      <label>
        Notes (2FA, email de récup…)
        <textarea rows={2} value={cnote} onChange={e => setCnote(e.target.value)} />
      </label>
      <div className="modal-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
        <button className="btn ghost" onClick={onCancel}>Annuler</button>
        <button className="btn" disabled={busy} onClick={() => onSave({ ...initial, label, username, password, cnote })}>
          {initial.id ? 'Enregistrer' : 'Ajouter au coffre 🔐'}
        </button>
      </div>
    </div>
  );
}
