import { NextResponse } from 'next/server';
import { login, rateLimit, rateReset } from '@/lib/db.js';
import { signIn } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* Anti brute force : 8 échecs / 10 min par IP et par nom. */
const LOGIN_LIMIT = { limit: 8, windowMs: 10 * 60 * 1000 };
const clientIp = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';

/* POST /api/auth/login → { name, code } */
export async function POST(req) {
  try {
    const b = await req.json().catch(() => null);
    if (!b || !b.name || !b.code) {
      return NextResponse.json({ error: 'Nom et code d\'accès requis' }, { status: 422 });
    }
    const ip = clientIp(req);
    const nameKey = String(b.name).trim().toLowerCase().slice(0, 60);
    const gate = rateLimit('login:' + ip + ':' + nameKey, LOGIN_LIMIT);
    if (!gate.ok) {
      const retry = Math.ceil(gate.retryAfterMs / 1000);
      return NextResponse.json(
        { error: `Trop de tentatives. Réessaie dans ${Math.ceil(retry / 60)} minute(s).` },
        { status: 429, headers: { 'Retry-After': String(retry) } }
      );
    }
    const user = await login(b.name, b.code);
    if (!user) {
      return NextResponse.json({ error: 'Nom ou code d\'accès incorrect' }, { status: 401 });
    }
    rateReset('login:' + ip + ':' + nameKey);
    await signIn(user.id);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: 'Connexion impossible' }, { status: 500 });
  }
}
