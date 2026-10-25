'use strict';
/**
 * Coffre-fort des identifiants — chiffrement AES-256-GCM avec mot de passe maître.
 * Le maître n'est JAMAIS stocké : seule une chaîne de vérification chiffrée
 * (scrypt + GCM) est conservée dans `meta`. Les mots de passe des plateformes
 * sont chiffrés dans `credentials.secret` (iv.tag.ciphertext, base64).
 */
const crypto = require('node:crypto');
const { db } = require('./db.js');

const VERIFIER = 'suivi-brazza-vault-v1';

function getMeta(key) {
  const r = db().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return r ? r.value : null;
}
function setMeta(key, value) {
  db().prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

function deriveKey(master, salt) {
  // scrypt : dérivation lente volontaire (N=16384) contre le brute force
  return crypto.scryptSync(String(master), Buffer.from(salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
}

function ensureSalt() {
  let salt = getMeta('cred_salt');
  if (!salt) {
    salt = crypto.randomBytes(16).toString('base64');
    setMeta('cred_salt', salt);
  }
  return salt;
}

function encryptWithMaster(master, plaintext) {
  const key = deriveKey(master, ensureSalt());
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(plaintext), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

function decryptWithMaster(master, blob) {
  if (!blob) return '';
  const [ivB64, tagB64, ctB64] = String(blob).split('.');
  const key = deriveKey(master, getMeta('cred_salt'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  d.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB64, 'base64')), d.final()]).toString('utf8');
}

function isConfigured() {
  return !!getMeta('cred_verifier');
}

/** Définit (ou remplace) le mot de passe maître. */
function setMaster(master) {
  setMeta('cred_verifier', encryptWithMaster(master, VERIFIER));
}

/** Vrai ssi le maître déchiffre la chaîne de vérification. */
function verifyMaster(master) {
  const v = getMeta('cred_verifier');
  if (!v) return false;
  try { return decryptWithMaster(master, v) === VERIFIER; } catch { return false; }
}

module.exports = { isConfigured, setMaster, verifyMaster, encryptWithMaster, decryptWithMaster };
