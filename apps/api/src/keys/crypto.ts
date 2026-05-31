import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export interface EncryptedKey {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptApiKey(plaintext: string, masterKeyHex: string): EncryptedKey {
  const key = Buffer.from(masterKeyHex, 'hex');
  const iv = randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptApiKey(enc: EncryptedKey, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(enc.authTag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return '****';
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`;
}
