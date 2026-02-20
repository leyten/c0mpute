/**
 * E2E Encryption helpers for c0mpute.ai
 * ECDH (P-256) key exchange + AES-256-GCM encryption
 * Works in both browser (Web Crypto API) and Node.js
 */

export interface KeyPair {
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}

/**
 * Generate an ECDH P-256 key pair for key exchange.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { publicKey, privateKey: keyPair.privateKey };
}

/**
 * Derive a shared AES-256-GCM key from our private key and peer's public key.
 */
export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKeyJwk: JsonWebKey
): Promise<CryptoKey> {
  const peerPublicKey = await crypto.subtle.importKey(
    'jwk',
    peerPublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string with AES-256-GCM. Returns base64(iv + ciphertext).
 */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a base64(iv + ciphertext) string with AES-256-GCM.
 */
export async function decrypt(key: CryptoKey, encryptedBase64: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}
