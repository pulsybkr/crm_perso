import { cookies } from 'next/headers';
import { userByToken, createSession, deleteSession } from './db.js';

export const SESSION_COOKIE = 'suivi_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

/** Vrai en production (HTTPS) : le cookie ne doit jamais transiter en clair. */
const isSecure = () => process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1';

/** Utilisateur de la requête courante (ou null). */
export async function currentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return userByToken(token) || null;
}

/** Ouvre une session et pose le cookie httpOnly. */
export async function signIn(userId) {
  const token = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure(),
    path: '/',
    maxAge: MAX_AGE
  });
  return token;
}

/** Ferme la session courante. */
export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}

/** Répond 401/403 proprement depuis une route. */
export function authError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw authError('Connexion requise', 401);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'admin') throw authError('Réservé à l\'administrateur', 403);
  return user;
}

/** Statut HTTP d'une erreur applicative (fallback configurable). */
export function statusOf(e, fallback = 500) {
  return e && Number.isInteger(e.status) ? e.status : fallback;
}
