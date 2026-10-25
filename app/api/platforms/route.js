import { NextResponse } from 'next/server';
import { listPlatforms, updatePlatform, createPlatform, deletePlatform, P_STATUSES } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function GET() {
  return NextResponse.json(listPlatforms());
}

export async function POST(req) {
  try {
    const b = await req.json();
    if (!b || !b.name || !String(b.name).trim()) return bad('name requis');
    const p = createPlatform({ name: b.name, url: b.url || '', cat: b.cat || 'ia', note: b.note || '' });
    return NextResponse.json(p, { status: 201 });
  } catch (e) {
    return bad(e.message, 500);
  }
}

export async function PATCH(req) {
  try {
    const b = await req.json();
    if (!b || !b.id) return bad('id requis');
    if ('status' in b && !P_STATUSES.includes(b.status)) return bad('Statut invalide', 422);
    const allowed = ['name', 'url', 'cat', 'note', 'status', 'unote', 'gain', 'position'];
    const fields = {};
    for (const k of allowed) if (k in b) fields[k] = b[k];
    if (!Object.keys(fields).length) return bad('aucun champ modifiable');
    const r = updatePlatform(b.id, fields);
    if (!r || r.changes === 0) return bad('plateforme introuvable', 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e.message, 500);
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return bad('id requis');
    const r = deletePlatform(id);
    if (r.changes === 0) return bad('plateforme introuvable', 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e.message, 500);
  }
}
