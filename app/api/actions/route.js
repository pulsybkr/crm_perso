import { NextResponse } from 'next/server';
import { listActions, updateAction, createAction, deleteAction, A_STATUSES } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function GET() {
  return NextResponse.json(listActions());
}

export async function POST(req) {
  try {
    const b = await req.json();
    if (!b || !b.title || !String(b.title).trim()) return bad('title requis');
    const a = createAction({ phase: b.phase || 'p1', title: b.title, detail: b.detail || '' });
    return NextResponse.json(a, { status: 201 });
  } catch (e) {
    return bad(e.message, 500);
  }
}

export async function PATCH(req) {
  try {
    const b = await req.json();
    if (!b || !b.id) return bad('id requis');
    if ('status' in b && !A_STATUSES.includes(b.status)) return bad('Statut invalide', 422);
    const allowed = ['phase', 'title', 'detail', 'status', 'unote', 'position'];
    const fields = {};
    for (const k of allowed) if (k in b) fields[k] = b[k];
    if (!Object.keys(fields).length) return bad('aucun champ modifiable');
    const r = updateAction(b.id, fields);
    if (!r || r.changes === 0) return bad('action introuvable', 404);
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
    const r = deleteAction(id);
    if (r.changes === 0) return bad('action introuvable', 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e.message, 500);
  }
}
