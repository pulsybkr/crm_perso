import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { updateUser, MIN_CODE_LENGTH } from '@/lib/db.js';
import { currentUser, SESSION_COOKIE } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const me = await currentUser();
    if (!me) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const b = await req.json().catch(() => null);
    const code = String(b?.code || '').trim();
    if (code.length < MIN_CODE_LENGTH) {
      return NextResponse.json({ error: `Code trop court (${MIN_CODE_LENGTH} caractères minimum)` }, { status: 422 });
    }
    /* On invalide les autres sessions mais on garde la session courante :
       l'utilisateur ne doit pas être déconnecté juste après avoir changé son code. */
    const store = await cookies();
    const currentToken = store.get(SESSION_COOKIE)?.value;
    const { user } = await updateUser(me.id, { code, keepSession: currentToken });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const status = e.status && e.status !== 500 ? e.status : 500;
    return NextResponse.json({ error: status === 500 ? 'Erreur serveur' : e.message }, { status });
  }
}
