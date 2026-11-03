import { NextResponse } from 'next/server';
import {
  listPlatforms, updateUserPlatform, updatePlatformCatalog,
  createPlatform, deletePlatform, getUser, platformAllowed
} from '@/lib/db.js';
import { requireUser, requireAdmin, statusOf } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

const bad = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });
const STATE_FIELDS = ['status', 'unote', 'gain'];
const CATALOG_FIELDS = ['name', 'url', 'cat', 'note', 'congo', 'position'];

/* GET /api/platforms → tableau de l'utilisateur connecté.
   ?user=<id> → tableau d'un autre membre, en lecture seule (admin seulement). */
export async function GET(req) {
  try {
    const me = await requireUser();
    const { searchParams } = new URL(req.url);
    const other = searchParams.get('user');
    if (other && other !== me.id) {
      if (me.role !== 'admin') return bad('Accès réservé à l\'administrateur', 403);
      if (!(await getUser(other))) return bad('utilisateur introuvable', 404);
      // vue admin : même périmètre que celui de la personne (statistiques cohérentes)
      const target = await getUser(other);
      return NextResponse.json(await listPlatforms(other, { all: target.role === 'admin' }));
    }
    return NextResponse.json(await listPlatforms(me.id, { all: me.role === 'admin' }));
  } catch (e) {
    return bad(statusOf(e) === 500 ? 'Erreur serveur' : e.message, statusOf(e));
  }
}

/* POST /api/platforms → ajoute une plateforme au catalogue commun. */
export async function POST(req) {
  try {
    const me = await requireUser();
    const b = await req.json();
    if (!b || !b.name || !String(b.name).trim()) return bad('name requis', 422);
    const p = await createPlatform({
      name: b.name, url: b.url || '', cat: b.cat || 'ia',
      note: b.note || '', congo: b.congo, status: b.status, userId: me.id
    });
    return NextResponse.json(p, { status: 201 });
  } catch (e) {
    const code = statusOf(e, e.status || 400);
    return bad(code >= 500 ? 'Erreur serveur' : e.message, code);
  }
}

/* PATCH /api/platforms → état personnel (statut/notes/gains) ;
   les champs du catalogue (nom, URL, catégorie, note, Congo) sont réservés à l'admin. */
export async function PATCH(req) {
  try {
    const me = await requireUser();
    const b = await req.json();
    if (!b || !b.id) return bad('id requis', 422);

    const state = {}, catalog = {};
    for (const k of STATE_FIELDS) if (k in b) state[k] = b[k];
    for (const k of CATALOG_FIELDS) if (k in b) catalog[k] = b[k];
    if (!Object.keys(state).length && !Object.keys(catalog).length) return bad('aucun champ modifiable', 422);

    if (Object.keys(catalog).length) {
      if (me.role !== 'admin') return bad('Seul l\'administrateur peut modifier la fiche commune', 403);
      await updatePlatformCatalog(b.id, catalog);
    }
    if (Object.keys(state).length) {
      if (me.role !== 'admin' && !(await platformAllowed(me.id, b.id))) {
        return bad('Cette plateforme ne t\'est pas autorisée', 403);
      }
      await updateUserPlatform(me.id, b.id, state);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = statusOf(e, e.status || 400);
    return bad(code >= 500 ? 'Erreur serveur' : e.message, code);
  }
}

/* DELETE /api/platforms?id=… → retire la plateforme du catalogue (admin). */
export async function DELETE(req) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return bad('id requis', 422);
    await deletePlatform(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = statusOf(e);
    return bad(code >= 500 ? 'Erreur serveur' : e.message, code);
  }
}
