import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

/* POST /api/auth/logout */
export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}
