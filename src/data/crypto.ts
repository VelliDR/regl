export interface EncryptedPayload {
  readonly iv: string; // Base64 12-byte IV
  readonly ciphertext: string; // Base64 ciphertext + tag
}

export interface WrappedKeyEnvelope {
  readonly salt: string; // Base64 16-byte salt
  readonly iterations: number; // 600,000
  readonly iv: string; // Base64 12-byte IV used to wrap DEK
  readonly wrappedDek: string; // Base64 encrypted DEK
  readonly verifierIv: string; // Base64 IV for verification string
  readonly verifierCiphertext: string; // Known plaintext encrypted to test password without decrypting all data
}

const VERIFIER_PLAINTEXT = "REGL_KEY_VERIFIED_OK";

/**
 * Derives Key Encryption Key (KEK) from user passphrase using PBKDF2-SHA256.
 */
export async function deriveKekFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = 600000,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

/**
 * Generates a random 256-bit Data Encryption Key (DEK).
 */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // Extractable only for wrapping
    ["encrypt", "decrypt"],
  );
}

/**
 * Creates an envelope wrapping the DEK with a password-derived KEK.
 */
export async function createKeyEnvelope(
  passphrase: string,
  dek: CryptoKey,
): Promise<{ envelope: WrappedKeyEnvelope; rawDek: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 600000;
  const kek = await deriveKekFromPassphrase(passphrase, salt, iterations);

  // Wrap DEK
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const rawDekBuffer = await crypto.subtle.exportKey("raw", dek);
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapIv },
    kek,
    rawDekBuffer,
  );

  // Verifier
  const verifierIv = crypto.getRandomValues(new Uint8Array(12));
  const verifierBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: verifierIv },
    dek,
    new TextEncoder().encode(VERIFIER_PLAINTEXT),
  );

  const envelope: WrappedKeyEnvelope = {
    salt: bufferToBase64(salt),
    iterations,
    iv: bufferToBase64(wrapIv),
    wrappedDek: bufferToBase64(new Uint8Array(wrappedBuffer)),
    verifierIv: bufferToBase64(verifierIv),
    verifierCiphertext: bufferToBase64(new Uint8Array(verifierBuffer)),
  };

  return { envelope, rawDek: dek };
}

/**
 * Unwraps and verifies the DEK using user passphrase.
 * Throws an Error if passphrase is incorrect or envelope is tampered.
 */
export async function unwrapDekFromEnvelope(
  passphrase: string,
  envelope: WrappedKeyEnvelope,
): Promise<CryptoKey> {
  const salt = base64ToBuffer(envelope.salt);
  const kek = await deriveKekFromPassphrase(
    passphrase,
    salt,
    envelope.iterations,
  );

  let rawDekBuffer: ArrayBuffer;
  try {
    rawDekBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuffer(envelope.iv) as BufferSource },
      kek,
      base64ToBuffer(envelope.wrappedDek) as BufferSource,
    );
  } catch {
    throw new Error("Geçersiz parola veya bozuk anahtar zarfı.");
  }

  const dek = await crypto.subtle.importKey(
    "raw",
    rawDekBuffer,
    { name: "AES-GCM" },
    false, // Once unwrapped in RAM, non-extractable!
    ["encrypt", "decrypt"],
  );

  // Verify against verifier ciphertext
  try {
    const verifiedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBuffer(envelope.verifierIv) as BufferSource,
      },
      dek,
      base64ToBuffer(envelope.verifierCiphertext) as BufferSource,
    );
    const verifiedText = new TextDecoder().decode(verifiedBuffer);
    if (verifiedText !== VERIFIER_PLAINTEXT) {
      throw new Error("Anahtar doğrulama başarısız.");
    }
  } catch {
    throw new Error("Geçersiz parola.");
  }

  return dek;
}

/**
 * Encrypts a plaintext string using the DEK with a fresh random 12-byte IV.
 */
export async function encryptWithDek(
  plainText: string,
  dek: CryptoKey,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dek,
    encoded,
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(cipherBuffer)),
  };
}

/**
 * Decrypts an encrypted payload using the DEK.
 */
export async function decryptWithDek(
  encrypted: EncryptedPayload,
  dek: CryptoKey,
): Promise<string> {
  const iv = base64ToBuffer(encrypted.iv);
  const cipherBytes = base64ToBuffer(encrypted.ciphertext);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    dek,
    cipherBytes as BufferSource,
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Helpers for Uint8Array <-> Base64 (chunked to prevent call-stack overflow on large arrays)
export function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
