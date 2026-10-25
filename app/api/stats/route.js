import { NextResponse } from 'next/server';
import { getStats } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getStats());
}
