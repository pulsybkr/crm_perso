'use client';
import { useState } from 'react';

/**
 * Écran d'entrée :
 * - `setup` : tout premier lancement → création du compte admin (reprend le tableau existant).
 * - sinon : nom + code d'accès.
 */
export default function Login({ setup, onDone }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [code2, setCode2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (setup && code !== code2) { setErr('Les deux codes ne correspondent pas'); return; }
    setBusy(true);
    try {
      const r = await fetch(setup ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      onDone(j.user);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>🇨🇬 Suivi Brazza</h1>
        <p className="auth-sub">
          {setup
            ? 'Premier lancement : crée ton compte administrateur. Ton tableau actuel sera repris tel quel.'
            : 'Connecte-toi avec ton nom et ton code d\'accès.'}
        </p>
        <label>
          Nom
          <input autoFocus required value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Chris" />
        </label>
        <label>
          {setup ? 'Choisis un code d\'accès' : 'Code d\'accès'}
          <input required type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="••••••" autoComplete="current-password" />
        </label>
        {setup && (
          <label>
            Confirme le code
            <input required type="password" value={code2} onChange={e => setCode2(e.target.value)} placeholder="••••••" />
          </label>
        )}
        {err && <div className="auth-error">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? '…' : setup ? 'Créer mon compte' : 'Se connecter'}</button>
        {setup && <p className="auth-note">Le code doit faire 6 caractères ou plus. Tu pourras le changer plus tard.</p>}
      </form>
    </div>
  );
}
