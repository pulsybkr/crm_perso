import { NextResponse } from 'next/server';
import { takeSnapshot, lastSnapshot, listSnapshots, getSnapshot, rateLimit } from '@/lib/db.js';
import { requireUser, statusOf } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* Le snapshot est enregistré en base (le disque d'un serveur serverless est éphémère).
   Écriture limitée à 1 toutes les 30 s par utilisateur pour éviter la saturation. */
const SNAPSHOT_LIMIT = { limit: 1, windowMs: 30 * 1000 };

export async function POST() {
  try {
    const me = await requireUser();
    const gate = rateLimit('snapshot:' + me.id, SNAPSHOT_LIMIT);
    if (!gate.ok) {
      const last = await lastSnapshot();
      return NextResponse.json({ ok: true, file: last ? last.file : null, throttled: true });
    }
    const file = await takeSnapshot({ userId: me.id });
    return NextResponse.json({ ok: true, file });
  } catch (e) {
    return NextResponse.json({ ok: false, error: statusOf(e) === 500 ? 'Erreur serveur' : e.message }, { status: statusOf(e) });
  }
}

export async function GET(req) {
  try {
    const me = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (searchParams.get('list') === '1') {
      if (me.role !== 'admin') return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 });
      return NextResponse.json(await listSnapshots(Number(searchParams.get('limit')) || 20));
    }
    if (id) {
      if (me.role !== 'admin') return NextResponse.json({ error: 'Accès réservé à l\'administrateur' }, { status: 403 });
      const snap = await getSnapshot(Number(id));
      if (!snap) return NextResponse.json({ error: 'snapshot introuvable' }, { status: 404 });
      return new NextResponse(snap.data, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${snap.file}"`
        }
      });
    }
    return NextResponse.json(await lastSnapshot());
  } catch (e) {
    return NextResponse.json({ error: statusOf(e) === 500 ? 'Erreur serveur' : e.message }, { status: statusOf(e) });
  }
}
