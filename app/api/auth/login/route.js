import { NextResponse } from 'next/server';
import { login } from '@/lib/db.js';
import { signIn } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* POST /api/auth/login → { name, code } */
export async function POST(req) {
  try {
    const b = await req.json();
    if (!b || !b.name || !b.code) {
      return NextResponse.json({ error: 'Nom et code d\'accès requis' }, { status: 422 });
    }
    const user = login(b.name, b.code);
    if (!user) {
      return NextResponse.json({ error: 'Nom ou code d\'accès incorrect' }, { status: 401 });
    }
    await signIn(user.id);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
