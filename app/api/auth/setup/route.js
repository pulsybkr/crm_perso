import { NextResponse } from 'next/server';
import { countUsers, setupAdmin, MIN_CODE_LENGTH, rateLimit } from '@/lib/db.js';
import { signIn } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

const SETUP_LIMIT = { limit: 5, windowMs: 30 * 60 * 1000 };
const clientIp = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';

/* POST /api/auth/setup → crée le premier compte (admin) et ouvre la session. */
export async function POST(req) {
  try {
    if (await countUsers() > 0) {
      return NextResponse.json({ error: 'La configuration a déjà été faite' }, { status: 409 });
    }
    if (!rateLimit('setup:' + clientIp(req), SETUP_LIMIT).ok) {
      return NextResponse.json({ error: 'Trop de tentatives' }, { status: 429 });
    }
    const b = await req.json().catch(() => null);
    if (!b || !b.name || !b.code) {
      return NextResponse.json({ error: 'Nom et code d\'accès requis' }, { status: 422 });
    }
    if (String(b.code).length < MIN_CODE_LENGTH) {
      return NextResponse.json({ error: `Code trop court (${MIN_CODE_LENGTH} caractères minimum)` }, { status: 422 });
    }
    const user = await setupAdmin({ name: b.name, code: b.code });
    await signIn(user.id);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    const status = e.status && e.status !== 500 ? e.status : 500;
    return NextResponse.json({ error: status === 500 ? 'Configuration impossible' : e.message }, { status });
  }
}
