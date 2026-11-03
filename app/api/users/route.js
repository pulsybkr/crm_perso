import { NextResponse } from 'next/server';
import { listUserSummaries, createUser, updateUser, deleteUser, getUser } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

const bad = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

/* GET /api/users → résumé d'avancement de chaque personne (admin). */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listUserSummaries());
  } catch (e) {
    return bad(e.message, e.status || 500);
  }
}

/* POST /api/users → { name, code? } ; le code généré n'est renvoyé qu'une fois. */
export async function POST(req) {
  try {
    await requireAdmin();
    const b = await req.json();
    if (!b || !b.name) return bad('name requis', 422);
    const { user, code } = await createUser({ name: b.name, code: b.code || undefined, role: b.role === 'admin' ? 'admin' : 'member' });
    return NextResponse.json({ user, code }, { status: 201 });
  } catch (e) {
    return bad(e.message, e.status || (String(e.message).includes('déjà pris') || String(e.message).includes('trop') ? 422 : 500));
  }
}

/* PATCH /api/users → renommer, changer le code, réinitialiser, changer le rôle. */
export async function PATCH(req) {
  try {
    const me = await requireAdmin();
    const b = await req.json();
    if (!b || !b.id) return bad('id requis', 422);
    if (!(await getUser(b.id))) return bad('utilisateur introuvable', 404);
    if (b.id === me.id && b.role === 'member') return bad('Impossible de retirer son propre rôle admin', 422);
    const patch = { resetCode: b.resetCode === true };
    if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name;
    if (typeof b.code === 'string' && b.code) patch.code = b.code;
    if (b.role === 'admin' || b.role === 'member') patch.role = b.role;
    const { user, code } = await updateUser(b.id, patch);
    return NextResponse.json({ user, code });
  } catch (e) {
    return bad(e.message, e.status || 422);
  }
}

/* DELETE /api/users?id=… (jamais soi-même). */
export async function DELETE(req) {
  try {
    const me = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return bad('id requis', 422);
    if (id === me.id) return bad('Impossible de supprimer son propre compte', 422);
    if (!getUser(id)) return bad('utilisateur introuvable', 404);
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e.message, e.status || 500);
  }
}
