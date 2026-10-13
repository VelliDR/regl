import { describe, it, expect } from 'vitest';
import {
  bufferToBase64,
  base64ToBuffer,
  createKeyEnvelope,
  decryptWithDek,
  encryptWithDek,
  generateDek,
  unwrapDekFromEnvelope,
} from '../../src/data/crypto';

describe('Kriptografi ve Kasa Güvenliği (crypto.ts)', () => {
  it('Base64 ve Buffer dönüşümleri çift yönlü ve hatasız çalışmalıdır', () => {
    const raw = new Uint8Array([0, 1, 2, 254, 255, 42, 99]);
    const b64 = bufferToBase64(raw);
    const reconstructed = base64ToBuffer(b64);
    expect(reconstructed).toEqual(raw);
  });

  it('Büyük dizilerde yığın taşması (stack overflow) olmadan base64 dönüşümü yapabilmelidir', () => {
    const large = new Uint8Array(50000); // 50 KB
    for (let i = 0; i < large.length; i++) {
      large[i] = i % 256;
    }
    const b64 = bufferToBase64(large);
    const decoded = base64ToBuffer(b64);
    expect(decoded.length).toBe(50000);
    expect(decoded[100]).toBe(100);
  });

  it('Zarf Şifreleme: Doğru parola ile DEK açılmalı, yanlış parola reddedilmelidir', async () => {
    const password = 'GucluParola_Test123!';
    const dek = await generateDek();

    // DEK'i parola ile sarmala
    const { envelope } = await createKeyEnvelope(password, dek);
    expect(envelope.iterations).toBe(600000);
    expect(envelope.wrappedDek).toBeDefined();

    // Doğru parola ile çöz
    const unwrappedDek = await unwrapDekFromEnvelope(password, envelope);
    expect(unwrappedDek).toBeDefined();

    // Yanlış parola ile açmayı dene -> HATA fırlatmalıdır
    await expect(unwrapDekFromEnvelope('YanlisParola!', envelope)).rejects.toThrow();
  });

  it('DEK ile veri şifreleme ve çözme gidiş-dönüşü çalışmalıdır', async () => {
    const dek = await generateDek();
    const sensitiveData = JSON.stringify({
      date: '2026-10-13',
      bleeding: 'heavy',
      bbt: 3665,
      note: 'Çok gizli kişisel sağlık verisi',
    });

    const encrypted = await encryptWithDek(sensitiveData, dek);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.ciphertext).not.toContain('3665');

    const decrypted = await decryptWithDek(encrypted, dek);
    expect(decrypted).toBe(sensitiveData);
  });
});
