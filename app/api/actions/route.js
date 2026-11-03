import { NextResponse } from 'next/server';
import { listActions, updateAction, createAction, deleteAction, A_STATUSES } from '@/lib/db.js';
import { requireAdmin, requireUser } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

const guard = async (fn, admin = false) => {
  try { await (admin ? requireAdmin() : requireUser()); } catch (e) { return bad(e.message, e.status || 401); }
  return fn();
};

export async function GET() {
  return guard(async () => NextResponse.json(await listActions()));
}

export async function POST(req) {
  return guard(async () => {
    try {
      const b = await req.json();
      if (!b || !b.title || !String(b.title).trim()) return bad('title requis');
      const a = await createAction({ phase: b.phase || 'p1', title: b.title, detail: b.detail || '' });
      return NextResponse.json(a, { status: 201 });
    } catch (e) {
      return bad(e.message, 500);
    }
  }, true);
}

export async function PATCH(req) {
  return guard(async () => {
    try {
      const b = await req.json();
      if (!b || !b.id) return bad('id requis');
      if ('status' in b && !A_STATUSES.includes(b.status)) return bad('Statut invalide', 422);
      const allowed = ['phase', 'title', 'detail', 'status', 'unote', 'position'];
      const fields = {};
      for (const k of allowed) if (k in b) fields[k] = b[k];
      if (!Object.keys(fields).length) return bad('aucun champ modifiable');
      const r = await updateAction(b.id, fields);
      if (!r || r.changes === 0) return bad('action introuvable', 404);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return bad(e.message, 500);
    }
  }, true);
}

export async function DELETE(req) {
  return guard(async () => {
    try {
      const { searchParams } = new URL(req.url);
      const id = searchParams.get('id');
      if (!id) return bad('id requis');
      const r = await deleteAction(id);
      if (r.changes === 0) return bad('action introuvable', 404);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return bad(e.message, 500);
    }
  }, true);
}
