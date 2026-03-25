import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { encryptAesEcb, decryptAesEcb, aesEcbPaddedSize } from "./aes-ecb.js";

function randomKey(): Buffer {
  return crypto.randomBytes(16);
}

describe("encryptAesEcb / decryptAesEcb", () => {
  it("round-trips empty buffer", () => {
    const key = randomKey();
    const plain = Buffer.alloc(0);
    const cipher = encryptAesEcb(plain, key);
    const decrypted = decryptAesEcb(cipher, key);
    expect(decrypted).toEqual(plain);
  });

  it("round-trips 1-byte buffer", () => {
    const key = randomKey();
    const plain = Buffer.from([0x42]);
    const cipher = encryptAesEcb(plain, key);
    const decrypted = decryptAesEcb(cipher, key);
    expect(decrypted).toEqual(plain);
  });

  it("round-trips 15-byte buffer (one byte short of block)", () => {
    const key = randomKey();
    const plain = crypto.randomBytes(15);
    const cipher = encryptAesEcb(plain, key);
    const decrypted = decryptAesEcb(cipher, key);
    expect(decrypted).toEqual(plain);
  });

  it("round-trips 16-byte buffer (exact block size)", () => {
    const key = randomKey();
    const plain = crypto.randomBytes(16);
    const cipher = encryptAesEcb(plain, key);
    const decrypted = decryptAesEcb(cipher, key);
    expect(decrypted).toEqual(plain);
  });

  it("round-trips 17-byte buffer (one byte over block)", () => {
    const key = randomKey();
    const plain = crypto.randomBytes(17);
    const cipher = encryptAesEcb(plain, key);
    const decrypted = decryptAesEcb(cipher, key);
    expect(decrypted).toEqual(plain);
  });

  it("round-trips 1024-byte buffer", () => {
    const key = randomKey();
    const plain = crypto.randomBytes(1024);
    const cipher = encryptAesEcb(plain, key);
    const decrypted = decryptAesEcb(cipher, key);
    expect(decrypted).toEqual(plain);
  });

  it("ciphertext length is always a multiple of 16", () => {
    const key = randomKey();
    for (const size of [0, 1, 15, 16, 17, 31, 32, 100, 1024]) {
      const plain = crypto.randomBytes(size);
      const cipher = encryptAesEcb(plain, key);
      expect(cipher.length % 16).toBe(0);
    }
  });

  it("different keys produce different ciphertext", () => {
    const plain = Buffer.from("hello world 1234");
    const cipher1 = encryptAesEcb(plain, randomKey());
    const cipher2 = encryptAesEcb(plain, randomKey());
    expect(cipher1.equals(cipher2)).toBe(false);
  });

  it("throws on invalid key length (not 16 bytes)", () => {
    const plain = Buffer.from("test");
    expect(() => encryptAesEcb(plain, Buffer.alloc(8))).toThrow();
    expect(() => encryptAesEcb(plain, Buffer.alloc(32))).toThrow();
    expect(() => encryptAesEcb(plain, Buffer.alloc(0))).toThrow();
  });

  it("decrypts to different plaintext or throws with wrong key", () => {
    const plain = Buffer.from("secret data here");
    const key = randomKey();
    const wrongKey = randomKey();
    const cipher = encryptAesEcb(plain, key);
    try {
      const result = decryptAesEcb(cipher, wrongKey);
      // If no padding error, decrypted content must differ from original
      expect(result.equals(plain)).toBe(false);
    } catch {
      // Padding error is also acceptable: wrong key corrupts PKCS7 padding
    }
  });
});

describe("aesEcbPaddedSize", () => {
  it("returns 16 for plaintext size 0", () => {
    expect(aesEcbPaddedSize(0)).toBe(16);
  });

  it("returns 16 for plaintext size 1 through 15", () => {
    for (let i = 1; i <= 15; i++) {
      expect(aesEcbPaddedSize(i)).toBe(16);
    }
  });

  it("returns 32 for plaintext size 16", () => {
    expect(aesEcbPaddedSize(16)).toBe(32);
  });

  it("returns 32 for plaintext size 17 through 31", () => {
    for (let i = 17; i <= 31; i++) {
      expect(aesEcbPaddedSize(i)).toBe(32);
    }
  });

  it("returns 48 for plaintext size 32", () => {
    expect(aesEcbPaddedSize(32)).toBe(48);
  });

  it("matches actual ciphertext length from encryptAesEcb", () => {
    const key = randomKey();
    for (const size of [0, 1, 15, 16, 17, 31, 32, 100, 255, 1024]) {
      const plain = crypto.randomBytes(size);
      const cipher = encryptAesEcb(plain, key);
      expect(cipher.length).toBe(aesEcbPaddedSize(size));
    }
  });
});
