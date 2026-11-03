import { NextResponse } from 'next/server';
import {
  isConfigured, setMaster, verifyMaster,
  encryptWithMaster, decryptWithMaster
} from '@/lib/crypto.js';
import { pool as getPool } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

const needMaster = (req) => {
  const master = req.headers.get('x-master');
  if (!master || !verifyMaster(master)) return null;
  return master;
};

const deny = (e) => NextResponse.json({ error: e.message }, { status: e.status || 401 });

const nowSql = "to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

/* ============ Coffre ============ */

export async function GET(req) {
  try { await requireAdmin(); } catch (e) { return deny(e); }
  const { searchParams } = new URL(req.url);

  if (searchParams.get('ids') === '1') {
    const { rows } = await getPool().query('SELECT DISTINCT platform_id FROM accounts');
    return NextResponse.json(rows.map(r => r.platform_id));
  }

  const pid = searchParams.get('platform');
  if (pid) {
    const master = needMaster(req);
    if (!master) return bad('coffre verrouillé ou maître invalide', 423);
    const { rows } = await getPool().query('SELECT id, label, username, secret, cnote, position FROM accounts WHERE platform_id = $1 ORDER BY position, id', [pid]);
    return NextResponse.json(rows.map(r => {
      let password = '';
      try { password = decryptWithMaster(master, r.secret); } catch { password = '⚠️ illisible'; }
      const { secret, ...rest } = r;
      return { ...rest, password };
    }));
  }

  const { rows: crow } = await getPool().query('SELECT COUNT(*)::int AS c FROM accounts');
  const count = crow[0].c;
  return NextResponse.json({ configured: isConfigured(), count });
}

export async function POST(req) {
  try {
    await requireAdmin();
    const b = await req.json();
    if (!b || !b.master) return bad('master requis');
    if (String(b.master).length < 6) return bad('mot de passe maître : 6 caractères minimum', 422);
    if (isConfigured()) {
      if (!verifyMaster(b.oldMaster || '')) return bad('ancien mot de passe maître invalide', 401);
      const { rows } = await getPool().query('SELECT id, secret FROM accounts');
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        for (const r of rows) {
          const plain = decryptWithMaster(b.oldMaster, r.secret);
          await client.query(`UPDATE accounts SET secret = $1, updated_at = ${nowSql} WHERE id = $2`, [encryptWithMaster(b.master, plain), r.id]);
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      setMaster(b.master);
      return NextResponse.json({ ok: true, reencrypted: rows.length });
    }
    setMaster(b.master);
    return NextResponse.json({ ok: true, reencrypted: 0 });
  } catch (e) {
    return bad(e.message, 500);
  }
}

export async function PUT(req) {
  try {
    await requireAdmin();
    const b = await req.json();
    if (!b || !b.platformId) return bad('platformId requis');
    const master = needMaster(req);
    if (!master) return bad('coffre verrouillé ou maître invalide', 423);

    if (b.loginUrl !== undefined) {
      await getPool().query(`UPDATE platforms SET login_url = $1, updated_at = ${nowSql} WHERE id = $2`, [String(b.loginUrl || ''), b.platformId]);
    }

    if (b.id) {
      const { rows: cur } = await getPool().query('SELECT * FROM accounts WHERE id = $1', [b.id]);
      if (!cur[0]) return bad('compte introuvable', 404);
      const c = cur[0];
      const secret = ('password' in b && b.password !== '') ? encryptWithMaster(master, String(b.password)) : null;
      if (secret !== null) {
        await getPool().query(`UPDATE accounts SET label = $1, username = $2, secret = $3, cnote = $4, updated_at = ${nowSql} WHERE id = $5`,
          [b.label ?? c.label, b.username ?? c.username, secret, b.cnote ?? c.cnote, b.id]);
      } else {
        await getPool().query(`UPDATE accounts SET label = $1, username = $2, cnote = $3, updated_at = ${nowSql} WHERE id = $4`,
          [b.label ?? c.label, b.username ?? c.username, b.cnote ?? c.cnote, b.id]);
      }
      return NextResponse.json({ ok: true, id: b.id });
    }

    const { rows: mr } = await getPool().query('SELECT COALESCE(MAX(position), -1) AS m FROM accounts WHERE platform_id = $1', [b.platformId]);
    const max = mr[0].m + 1;
    const id = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await getPool().query('INSERT INTO accounts (id, platform_id, label, username, secret, cnote, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, b.platformId, b.label || 'Compte', b.username || '', encryptWithMaster(master, String(b.password || '')), b.cnote || '', max]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return bad(e.message, 500);
  }
}

export async function DELETE(req) {
  try { await requireAdmin(); } catch (e) { return deny(e); }
  const { searchParams } = new URL(req.url);
  const aid = searchParams.get('account');
  if (!aid) return bad('account requis');
  const r = await getPool().query('DELETE FROM accounts WHERE id = $1', [aid]);
  return NextResponse.json({ ok: true, deleted: r.rowCount });
}
