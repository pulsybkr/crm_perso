import { NextResponse } from 'next/server';
import { listUserSummaries, createUser, updateUser, deleteUser, getUser, countUserAccounts } from '@/lib/db.js';
import { requireAdmin, statusOf } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

const bad = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
const fail = (e, fallback = 422) => {
  const code = statusOf(e, fallback);
  return bad(code >= 500 ? 'Erreur serveur' : e.message, code);
};

/* GET /api/users → résumé d'avancement de chaque personne (admin). */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listUserSummaries());
  } catch (e) {
    return bad(statusOf(e) === 500 ? 'Erreur serveur' : e.message, statusOf(e));
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
    return fail(e);
  }
}

/* PATCH /api/users → renommer, changer le code, réinitialiser, changer le rôle.
   Un membre peut uniquement modifier son propre code (via /api/auth/code). */
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
    return fail(e);
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
    if (!(await getUser(id))) return bad('utilisateur introuvable', 404);
    const accounts = await countUserAccounts(id);
    await deleteUser(id);
    return NextResponse.json({ ok: true, accountsRemoved: accounts });
  } catch (e) {
    return fail(e, 500);
  }
}
