import { NextResponse } from 'next/server';
import { countUsers, setupAdmin } from '@/lib/db.js';
import { signIn } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* POST /api/auth/setup → crée le premier compte (admin) et reprend le tableau existant. */
export async function POST(req) {
  try {
    if (await countUsers() > 0) {
      return NextResponse.json({ error: 'La configuration a déjà été faite' }, { status: 409 });
    }
    const b = await req.json();
    if (!b || !b.name || !b.code) {
      return NextResponse.json({ error: 'Nom et code d\'accès requis' }, { status: 422 });
    }
    if (String(b.code).length < 4) {
      return NextResponse.json({ error: 'Code trop court (4 caractères minimum)' }, { status: 422 });
    }
    const user = await setupAdmin({ name: b.name, code: b.code });
    await signIn(user.id);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
