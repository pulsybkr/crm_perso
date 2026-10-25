import { NextResponse } from 'next/server';
import { takeSnapshot, lastSnapshot } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

/* POST /api/snapshot → écrit un snapshot JSON dans data/backups/ (rotation 40).
   Appelé automatiquement par l'app à chaque sauvegarde. */
export async function POST() {
  try {
    const file = takeSnapshot();
    return NextResponse.json({ ok: true, file });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(lastSnapshot());
}
