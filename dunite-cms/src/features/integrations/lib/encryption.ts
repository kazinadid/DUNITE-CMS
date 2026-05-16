// ============================================================================
// DUNITE CMS — Token encryption utility (server-side only)
// ============================================================================
// AES-256-GCM encryption for social access tokens.
// NEVER import this file from client components.
//
// Key format: 32 random bytes, base64url encoded.
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
// ============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 16;  // bytes
const TAG_LENGTH = 16; // bytes
const KEY_BYTES = 32;  // bytes (256-bit)
const ENCODING = 'base64url' as const;

/** Token prefix written before the ciphertext to support future algorithm rotation. */
const FORMAT_VERSION = 'v1' as const;

function getEncryptionKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      '[encryption] SOCIAL_TOKEN_ENCRYPTION_KEY is not set. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"'
    );
  }
  const key = Buffer.from(raw, 'base64url');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `[encryption] Key must be exactly ${KEY_BYTES} bytes (got ${key.length}).`
    );
  }
  return key;
}

/**
 * Encrypts a plaintext string (typically an OAuth access token).
 * Returns a base64url-encoded string: `v1.<iv>.<authTag>.<ciphertext>`
 *
 * @server-only — never call from client components
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error('[encryption] Cannot encrypt empty value.');
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv | authTag | ciphertext, then base64url the whole blob.
  const payload = Buffer.concat([iv, authTag, encrypted]).toString(ENCODING);
  return `${FORMAT_VERSION}.${payload}`;
}

/**
 * Decrypts a token previously encrypted with `encryptToken`.
 *
 * @server-only — never call from client components
 * @throws if key is missing, format is invalid, or authentication fails
 */
export function decryptToken(encoded: string): string {
  if (!encoded) throw new Error('[encryption] Cannot decrypt empty value.');

  const [version, payload] = encoded.split('.', 2);
  if (version !== FORMAT_VERSION || !payload) {
    throw new Error('[encryption] Unknown token format version.');
  }

  const key = getEncryptionKey();
  const data = Buffer.from(payload, ENCODING);

  if (data.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('[encryption] Ciphertext too short — possibly corrupted.');
  }

  const iv         = data.subarray(0, IV_LENGTH);
  const authTag    = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return (
    decipher.update(ciphertext).toString('utf8') +
    decipher.final('utf8')
  );
}

/**
 * Returns TRUE if the given string looks like an encrypted token
 * (version prefix present). Cheap heuristic — does not attempt decryption.
 */
export function isEncryptedToken(value: string): boolean {
  return value.startsWith(`${FORMAT_VERSION}.`);
}

/**
 * Masks a token for safe logging — shows only first 6 chars.
 */
export function maskToken(token: string): string {
  if (!token || token.length < 10) return '***';
  return `${token.slice(0, 6)}…[masked]`;
}
