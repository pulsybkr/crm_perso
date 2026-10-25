import { NextResponse } from 'next/server';
import {
  isConfigured, setMaster, verifyMaster,
  encryptWithMaster, decryptWithMaster
} from '@/lib/crypto.js';
import { db } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

/* GET → état du coffre (configuré ? déverrouillé côté client ? nb d'entrées)
   GET ?ids=1 → liste simple des platform_id ayant des identifiants (jamais de secret)
   GET ?platform=xxx → décrypte UNE entrée (le client passe le maître en header) */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const pid = searchParams.get('platform');

  if (searchParams.get('ids') === '1') {
    const rows = db().prepare('SELECT platform_id FROM credentials').all();
    return NextResponse.json(rows.map(r => r.platform_id));
  }

  // GET ?platform=xxx → décrypte UNE entrée (le client passe le maître en header)
  if (pid) {
    const master = req.headers.get('x-master');
    if (!master) return bad('coffre verrouillé', 423);
    if (!verifyMaster(master)) return bad('mot de passe maître invalide', 401);
    const row = db().prepare('SELECT platform_id, login_url, username, secret, cnote FROM credentials WHERE platform_id = ?').get(pid);
    if (!row) return NextResponse.json(null);
    try {
      row.password = decryptWithMaster(master, row.secret);
    } catch {
      return bad('déchiffrement impossible (maître changé ?)', 500);
    }
    delete row.secret;
    return NextResponse.json(row);
  }

  const count = db().prepare('SELECT COUNT(*) AS c FROM credentials').get().c;
  return NextResponse.json({ configured: isConfigured(), count });
}

/* POST → définir le maître (première fois) ou le changer */
export async function POST(req) {
  try {
    const b = await req.json();
    if (!b || !b.master) return bad('master requis');
    if (String(b.master).length < 6) return bad('mot de passe maître : 6 caractères minimum', 422);
    if (isConfigured()) {
      if (!verifyMaster(b.oldMaster || '')) return bad('ancien mot de passe maître invalide', 401);
      // rechiffrer toutes les entrées avec le nouveau maître
      const rows = db().prepare('SELECT platform_id, secret FROM credentials').all();
      const tx = db().transaction(() => {
        rows.forEach(r => {
          const plain = decryptWithMaster(b.oldMaster, r.secret);
          const re = encryptWithMaster(b.master, plain);
          db().prepare('UPDATE credentials SET secret = ?, updated_at = datetime("now") WHERE platform_id = ?')
            .run(re, r.platform_id);
        });
        setMaster(b.master);
      });
      tx();
      return NextResponse.json({ ok: true, reencrypted: rows.length });
    }
    setMaster(b.master);
    return NextResponse.json({ ok: true, reencrypted: 0 });
  } catch (e) {
    return bad(e.message, 500);
  }
}

/* PUT → enregistrer / mettre à jour les identifiants d'une plateforme */
export async function PUT(req) {
  try {
    const b = await req.json();
    const master = req.headers.get('x-master');
    if (!b || !b.platformId) return bad('platformId requis');
    if (!master || !verifyMaster(master)) return bad('coffre verrouillé ou maître invalide', 423);

    const secret = ('password' in b) ? encryptWithMaster(master, String(b.password || '')) : null;
    const cur = db().prepare('SELECT * FROM credentials WHERE platform_id = ?').get(b.platformId);

    if (cur) {
      if (secret !== null) {
        db().prepare('UPDATE credentials SET login_url = ?, username = ?, secret = ?, cnote = ?, updated_at = datetime("now") WHERE platform_id = ?')
          .run(b.loginUrl ?? cur.login_url, b.username ?? cur.username, secret, b.cnote ?? cur.cnote, b.platformId);
      } else {
        db().prepare('UPDATE credentials SET login_url = ?, username = ?, cnote = ?, updated_at = datetime("now") WHERE platform_id = ?')
          .run(b.loginUrl ?? cur.login_url, b.username ?? cur.username, b.cnote ?? cur.cnote, b.platformId);
      }
    } else {
      if (secret === null) return bad('password requis à la création', 422);
      db().prepare('INSERT INTO credentials (platform_id, login_url, username, secret, cnote) VALUES (?, ?, ?, ?, ?)')
        .run(b.platformId, b.loginUrl || '', b.username || '', secret, b.cnote || '');
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e.message, 500);
  }
}

/* DELETE → effacer les identifiants d'une plateforme */
export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const pid = searchParams.get('platform');
  if (!pid) return bad('platform requis');
  const r = db().prepare('DELETE FROM credentials WHERE platform_id = ?').run(pid);
  return NextResponse.json({ ok: true, deleted: r.changes });
}
