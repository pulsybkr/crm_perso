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

const needMaster = (req) => {
  const master = req.headers.get('x-master');
  if (!master || !verifyMaster(master)) return null;
  return master;
};

/* ============ Coffre ============ */

/* GET → état du coffre · ?ids=1 → platform_id ayant des comptes · ?platform=xxx → comptes décryptés */
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('ids') === '1') {
    const rows = db().prepare('SELECT DISTINCT platform_id FROM accounts').all();
    return NextResponse.json(rows.map(r => r.platform_id));
  }

  const pid = searchParams.get('platform');
  if (pid) {
    const master = needMaster(req);
    if (!master) return bad('coffre verrouillé ou maître invalide', 423);
    const rows = db().prepare('SELECT id, label, username, secret, cnote, position FROM accounts WHERE platform_id = ? ORDER BY position, id').all(pid);
    return NextResponse.json(rows.map(r => {
      let password = '';
      try { password = decryptWithMaster(master, r.secret); } catch { password = '⚠️ illisible'; }
      const { secret, ...rest } = r;
      return { ...rest, password };
    }));
  }

  const count = db().prepare('SELECT COUNT(*) AS c FROM accounts').get().c;
  return NextResponse.json({ configured: isConfigured(), count });
}

/* POST → définir le maître (première fois) ou le changer (rechiffre tout) */
export async function POST(req) {
  try {
    const b = await req.json();
    if (!b || !b.master) return bad('master requis');
    if (String(b.master).length < 6) return bad('mot de passe maître : 6 caractères minimum', 422);
    if (isConfigured()) {
      if (!verifyMaster(b.oldMaster || '')) return bad('ancien mot de passe maître invalide', 401);
      const rows = db().prepare('SELECT id, secret FROM accounts').all();
      const tx = db().transaction(() => {
        rows.forEach(r => {
          const plain = decryptWithMaster(b.oldMaster, r.secret);
          db().prepare("UPDATE accounts SET secret = ?, updated_at = datetime('now') WHERE id = ?")
            .run(encryptWithMaster(b.master, plain), r.id);
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

/* ============ Comptes ============ */

/* PUT → créer OU mettre à jour un compte.
   body: { platformId, id?, label?, username?, password?, cnote?, loginUrl? } */
export async function PUT(req) {
  try {
    const b = await req.json();
    if (!b || !b.platformId) return bad('platformId requis');
    const master = needMaster(req);
    if (!master) return bad('coffre verrouillé ou maître invalide', 423);

    // loginUrl facultatif → mis sur la plateforme
    if (b.loginUrl !== undefined) {
      db().prepare("UPDATE platforms SET login_url = ?, updated_at = datetime('now') WHERE id = ?")
        .run(String(b.loginUrl || ''), b.platformId);
    }

    if (b.id) {
      const cur = db().prepare('SELECT * FROM accounts WHERE id = ?').get(b.id);
      if (!cur) return bad('compte introuvable', 404);
      const secret = ('password' in b && b.password !== '') ? encryptWithMaster(master, String(b.password)) : null;
      if (secret !== null) {
        db().prepare("UPDATE accounts SET label = ?, username = ?, secret = ?, cnote = ?, updated_at = datetime('now') WHERE id = ?")
          .run(b.label ?? cur.label, b.username ?? cur.username, secret, b.cnote ?? cur.cnote, b.id);
      } else {
        db().prepare("UPDATE accounts SET label = ?, username = ?, cnote = ?, updated_at = datetime('now') WHERE id = ?")
          .run(b.label ?? cur.label, b.username ?? cur.username, b.cnote ?? cur.cnote, b.id);
      }
      return NextResponse.json({ ok: true, id: b.id });
    }

    db().prepare('INSERT INTO accounts (id, platform_id, label, username, secret, cnote, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        b.platformId, b.label || 'Compte', b.username || '',
        encryptWithMaster(master, String(b.password || '')), b.cnote || '',
        db().prepare('SELECT COALESCE(MAX(position), -1) AS m FROM accounts WHERE platform_id = ?').get(b.platformId).m + 1
      );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return bad(e.message, 500);
  }
}

/* DELETE → supprimer un compte (?account=xxx) */
export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const aid = searchParams.get('account');
  if (!aid) return bad('account requis');
  const r = db().prepare('DELETE FROM accounts WHERE id = ?').run(aid);
  return NextResponse.json({ ok: true, deleted: r.changes });
}
