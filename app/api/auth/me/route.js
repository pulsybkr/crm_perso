import { NextResponse } from 'next/server';
import { countUsers } from '@/lib/db.js';
import { currentUser } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* GET /api/auth/me → { user, setup } ; setup=true au tout premier lancement. */
export async function GET() {
  const user = await currentUser();
  return NextResponse.json({ user, setup: countUsers() === 0 });
}
