'use strict';
/**
 * Coffre-fort des identifiants — chiffrement AES-256-GCM avec mot de passe maître.
 * Le maître n'est JAMAIS stocké : seule une chaîne de vérification chiffrée
 * (scrypt + GCM) est conservée dans `meta`. Les mots de passe des plateformes
 * sont chiffrés dans `accounts.secret` (iv.tag.ciphertext, base64).
 */
const crypto = require('node:crypto');
const { q } = require('./db.js');

const VERIFIER = 'suivi-brazza-vault-v1';
/* Paramètres scrypt du coffre : dérivation volontairement lente (≈ 100 ms). */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function getMeta(key) {
  const r = await q('SELECT value FROM meta WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}
async function setMeta(key, value, client) {
  const run = client ? client.query.bind(client) : q;
  await run(`INSERT INTO meta (key, value) VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, value]);
}
async function getSalt() {
  return getMeta('cred_salt');
}

function deriveKey(master, salt) {
  return crypto.scryptSync(String(master), Buffer.from(String(salt), 'base64'), 32, SCRYPT);
}

async function encryptWithMaster(master, plaintext) {
  const salt = await getSalt();
  if (!salt) throw new Error('coffre non initialisé');
  const key = deriveKey(master, salt);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

async function decryptWithMaster(master, blob) {
  if (!blob) return '';
  const [ivB64, tagB64, ctB64] = String(blob).split('.');
  const salt = await getSalt();
  if (!salt || !ivB64 || !tagB64 || !ctB64) throw new Error('secret illisible');
  const key = deriveKey(master, salt);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  d.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB64, 'base64')), d.final()]).toString('utf8');
}

async function isConfigured() {
  return !!(await getMeta('cred_verifier'));
}

/** Définit le mot de passe maître (crée le sel au premier passage). */
async function setMaster(master) {
  if (!(await getMeta('cred_salt'))) {
    await setMeta('cred_salt', crypto.randomBytes(16).toString('base64'));
  }
  await setMeta('cred_verifier', await encryptWithMaster(master, VERIFIER));
}

/** Vrai ssi le maître déchiffre la chaîne de vérification. */
async function verifyMaster(master) {
  if (!master) return false;
  const v = await getMeta('cred_verifier');
  if (!v) return false;
  try { return (await decryptWithMaster(master, v)) === VERIFIER; } catch { return false; }
}

module.exports = { isConfigured, setMaster, verifyMaster, encryptWithMaster, decryptWithMaster };
