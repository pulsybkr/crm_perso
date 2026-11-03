import { NextResponse } from 'next/server';
import { takeSnapshot, lastSnapshot } from '@/lib/db.js';
import { requireUser } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* POST /api/snapshot → écrit un snapshot JSON dans data/backups/ (rotation 40).
   Appelé automatiquement par l'app à chaque sauvegarde. */
export async function POST() {
  try {
    await requireUser();
    const file = takeSnapshot();
    return NextResponse.json({ ok: true, file });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(lastSnapshot());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
