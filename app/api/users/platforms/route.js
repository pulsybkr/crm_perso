import { NextResponse } from 'next/server';
import { getUser, listPlatformAccess, setUserPlatforms } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

const bad = (msg, code = 400) => NextResponse.json({ error: msg }, { status: code });

/* GET /api/users/platforms?user=<id> → toutes les plateformes + autorisation (admin). */
export async function GET(req) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('user');
    if (!id) return bad('user requis', 422);
    const user = await getUser(id);
    if (!user) return bad('utilisateur introuvable', 404);
    return NextResponse.json({ user, platforms: await listPlatformAccess(id) });
  } catch (e) {
    return bad(e.message, e.status || 500);
  }
}

/* PUT /api/users/platforms → { userId, platformIds: [...] } remplace la liste autorisée. */
export async function PUT(req) {
  try {
    await requireAdmin();
    const b = await req.json();
    if (!b || !b.userId) return bad('userId requis', 422);
    if (!Array.isArray(b.platformIds)) return bad('platformIds doit être un tableau', 422);
    const user = await getUser(b.userId);
    if (!user) return bad('utilisateur introuvable', 404);
    if (user.role === 'admin') return bad('Un administrateur voit toujours tous les sites', 422);
    const counts = await setUserPlatforms(b.userId, b.platformIds);
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    return bad(e.message, e.status || 500);
  }
}
