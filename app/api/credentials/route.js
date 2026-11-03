import { NextResponse } from 'next/server';
import {
  isConfigured, setMaster, verifyMaster,
  encryptWithMaster, decryptWithMaster
} from '@/lib/crypto.js';
import { pool as getPool, q, NOW, newId, rateLimit, rateReset } from '@/lib/db.js';
import { requireAdmin } from '@/lib/auth.js';

export const dynamic = 'force-dynamic';

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

/* Anti brute force sur le mot de passe maître : 10 essais / 10 min / IP. */
const MASTER_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
const clientIp = (req) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';

/**
 * Déverrouillage du coffre.
 *
 * Le mot de passe maître reste dans le corps chiffré de la requête et n'est JAMAIS
 * persisté (ni cookie, ni base, ni log). Il est transmis une seule fois par
 * opération, via POST /api/credentials/unlock, qui répond avec un jeton opaque
 * à durée de vie courte (5 min) stocké côté serveur. Les autres routes
 * n'acceptent que ce jeton : le maître ne circule donc plus à chaque requête.
 */
const UNLOCK_TTL_MS = 5 * 60 * 1000;
const vaults = globalThis.__vaultSessions || (globalThis.__vaultSessions = new Map());

const userOf = (me) => (me && typeof me.then === 'function' ? null : me && me.id) || 'admin';

function newVaultToken(master, userId) {
  const token = newId('v');
  vaults.set(token, { master, userId, exp: Date.now() + UNLOCK_TTL_MS });
  for (const [t, s] of vaults) if (s.exp <= Date.now()) vaults.delete(t);
  const count = [...vaults.values()].filter(s => s.userId === userId).length;
  if (count > 20) { // borne mémoire : on garde les plus récents
    [...vaults.entries()].filter(([, s]) => s.userId === userId)
      .sort((a, b) => a[1].exp - b[1].exp).slice(0, count - 20).forEach(([t]) => vaults.delete(t));
  }
  return token;
}

function readVaultToken(token, userId) {
  const s = token && vaults.get(token);
  if (!s) return null;
  if (s.exp <= Date.now()) { vaults.delete(token); return null; }
  if (userId && s.userId !== userId) return null;
  return s.master;
}

/** Maître de la requête : jeton de coffre uniquement (l'en-tête x-master a été retiré). */
async function needMaster(req, userId) {
  const token = req.headers.get('x-vault-token');
  const master = readVaultToken(token, userId);
  return master || null;
}

const deny = (e) => NextResponse.json({ error: e.message }, { status: e.status || 401 });
const fail = (e) => NextResponse.json({ error: e.message }, { status: e.status && e.status !== 500 ? e.status : 400 });

async function adminOrDeny() {
  const me = await requireAdmin();
  return { me, id: userOf(me) };
}

/* ============ Coffre ============ */

export async function GET(req) {
  try {
    await requireAdmin();
  } catch (e) { return deny(e); }
  const { searchParams } = new URL(req.url);

  if (searchParams.get('ids') === '1') {
    const { rows } = await q('SELECT DISTINCT platform_id FROM accounts');
    return NextResponse.json(rows.map(r => r.platform_id));
  }

  const pid = searchParams.get('platform');
  if (pid) {
    const { me, id } = await adminOrDeny();
    const master = await needMaster(req, id);
    if (!master) return bad('coffre verrouillé : déverrouille-le d\'abord', 423);
    const { rows } = await q(
      'SELECT id, label, username, secret, cnote, position FROM accounts WHERE platform_id = $1 ORDER BY position, id', [pid]);
    const out = [];
    for (const r of rows) {
      let password = '';
      try { password = await decryptWithMaster(master, r.secret); } catch { password = '⚠️ illisible'; }
      const { secret, ...rest } = r;
      out.push({ ...rest, password });
    }
    return NextResponse.json(out);
  }

  const { rows: crow } = await q('SELECT COUNT(*)::int AS c FROM accounts');
  return NextResponse.json({ configured: await isConfigured(), count: crow[0].c });
}

/**
 * POST /api/credentials — configuration, déverrouillage ou changement du maître.
 *  - { master }                      → crée le maître (première fois) OU le change (avec oldMaster).
 *  - { master, unlock: true }        → vérifie le maître et renvoie un jeton de coffre.
 */
export async function POST(req) {
  let me, id;
  try { ({ me, id } = await adminOrDeny()); } catch (e) { return deny(e); }
  const ipKey = 'vault:' + clientIp(req);
  try {
    const b = await req.json().catch(() => null);
    if (!b || !b.master) return bad('master requis', 422);
    const gate = rateLimit(ipKey, MASTER_LIMIT);
    if (!gate.ok) return bad('Trop de tentatives, réessaie plus tard', 429);

    if (b.unlock) {
      if (!(await verifyMaster(String(b.master)))) return bad('mot de passe maître invalide', 401);
      rateReset(ipKey);
      return NextResponse.json({ ok: true, token: newVaultToken(String(b.master), id) });
    }

    if (String(b.master).length < 8) return bad('mot de passe maître : 8 caractères minimum', 422);

    if (await isConfigured()) {
      /* Changement de maître : réchiffrement + vérificateur dans la MÊME transaction. */
      if (!(await verifyMaster(b.oldMaster || ''))) return bad('ancien mot de passe maître invalide', 401);
      rateReset(ipKey);
      const { rows } = await q('SELECT id, secret FROM accounts');
      const plain = [];
      for (const r of rows) plain.push([r.id, await decryptWithMaster(b.oldMaster, r.secret)]);
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        for (const [accId, pw] of plain) {
          await client.query(`UPDATE accounts SET secret = $1, updated_at = ${NOW} WHERE id = $2`,
            [await encryptWithMaster(b.master, pw), accId]);
        }
        const verifier = await encryptWithMaster(b.master, 'suivi-brazza-vault-v1');
        await client.query(`INSERT INTO meta (key, value) VALUES ('cred_verifier', $1)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [verifier]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
      return NextResponse.json({ ok: true, reencrypted: rows.length, token: newVaultToken(String(b.master), id) });
    }

    await setMaster(String(b.master));
    rateReset(ipKey);
    return NextResponse.json({ ok: true, reencrypted: 0, token: newVaultToken(String(b.master), id) });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req) {
  let id;
  try { ({ id } = await adminOrDeny()); } catch (e) { return deny(e); }
  try {
    const b = await req.json();
    if (!b || !b.platformId) return bad('platformId requis', 422);
    const master = await needMaster(req, id);
    if (!master) return bad('coffre verrouillé : déverrouille-le d\'abord', 423);
    if (!(await q('SELECT 1 FROM platforms WHERE id = $1', [b.platformId])).rowCount) {
      return bad('plateforme introuvable', 404);
    }

    if (b.loginUrl !== undefined) {
      await q(`UPDATE platforms SET login_url = $1, updated_at = ${NOW} WHERE id = $2`,
        [String(b.loginUrl || ''), b.platformId]);
    }

    if (b.id) {
      const { rows: cur } = await q('SELECT * FROM accounts WHERE id = $1 AND platform_id = $2', [b.id, b.platformId]);
      const c = cur[0];
      if (!c) return bad('compte introuvable', 404);
      const secret = ('password' in b && b.password !== '') ? await encryptWithMaster(master, String(b.password)) : null;
      if (secret !== null) {
        await q(`UPDATE accounts SET label = $1, username = $2, secret = $3, cnote = $4, updated_at = ${NOW} WHERE id = $5`,
          [b.label ?? c.label, b.username ?? c.username, secret, b.cnote ?? c.cnote, b.id]);
      } else {
        await q(`UPDATE accounts SET label = $1, username = $2, cnote = $3, updated_at = ${NOW} WHERE id = $4`,
          [b.label ?? c.label, b.username ?? c.username, b.cnote ?? c.cnote, b.id]);
      }
      return NextResponse.json({ ok: true, id: b.id });
    }

    if (b.loginUrl !== undefined && b.label === undefined && b.username === undefined && b.password === undefined) {
      return NextResponse.json({ ok: true, loginUrlUpdated: true });
    }

    const { rows: mr } = await q('SELECT COALESCE(MAX(position), -1) AS m FROM accounts WHERE platform_id = $1', [b.platformId]);
    const accId = newId('c');
    await q('INSERT INTO accounts (id, platform_id, label, username, secret, cnote, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [accId, b.platformId, String(b.label || 'Compte'), String(b.username || ''),
        await encryptWithMaster(master, String(b.password || '')), String(b.cnote || ''), mr[0].m + 1]);
    return NextResponse.json({ ok: true, id: accId }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req) {
  let id;
  try { ({ id } = await adminOrDeny()); } catch (e) { return deny(e); }
  const { searchParams } = new URL(req.url);
  const aid = searchParams.get('account');
  if (!aid) return bad('account requis', 422);
  if (!(await needMaster(req, id))) return bad('coffre verrouillé : déverrouille-le d\'abord', 423);
  const r = await q('DELETE FROM accounts WHERE id = $1', [aid]);
  if (r.rowCount === 0) return bad('compte introuvable', 404);
  return NextResponse.json({ ok: true, deleted: r.rowCount });
}
