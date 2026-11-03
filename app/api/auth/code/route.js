import { NextResponse } from 'next/server';
import { getUser, updateUser } from '@/lib/db.js';
import { currentUser } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const me = await currentUser();
    if (!me) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const b = await req.json();
    const code = String(b?.code || '').trim();
    if (code.length < 6) return NextResponse.json({ error: 'Code trop court (6 caractères minimum)' }, { status: 422 });
    const { user } = await updateUser(me.id, { code });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
