import { NextResponse } from 'next/server';
import { getStats, getUser } from '@/lib/db.js';
import { requireUser, statusOf } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* GET /api/stats → stats de l'utilisateur connecté · ?user=<id> (admin). */
export async function GET(req) {
  try {
    const me = await requireUser();
    const { searchParams } = new URL(req.url);
    const other = searchParams.get('user');
    if (other && other !== me.id) {
      if (me.role !== 'admin') return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 });
      const target = await getUser(other);
      if (!target) return NextResponse.json({ error: 'utilisateur introuvable' }, { status: 404 });
      /* Même périmètre que le tableau affiché : un admin voit tout, un membre ses sites autorisés. */
      return NextResponse.json(await getStats(other, { all: target.role === 'admin' }));
    }
    return NextResponse.json(await getStats(me.id, { all: me.role === 'admin' }));
  } catch (e) {
    return NextResponse.json({ error: statusOf(e) === 500 ? 'Erreur serveur' : e.message }, { status: statusOf(e) });
  }
}
