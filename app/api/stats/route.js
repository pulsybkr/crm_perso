import { NextResponse } from 'next/server';
import { getStats, getUser } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* GET /api/stats → stats de l'utilisateur connecté · ?user=<id> (admin). */
export async function GET(req) {
  try {
    const me = await requireUser();
    const { searchParams } = new URL(req.url);
    const other = searchParams.get('user');
    if (other && other !== me.id) {
      if (me.role !== 'admin') return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 });
      if (!getUser(other)) return NextResponse.json({ error: 'utilisateur introuvable' }, { status: 404 });
      return NextResponse.json(getStats(other));
    }
    return NextResponse.json(getStats(me.id, { all: me.role === 'admin' }));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
