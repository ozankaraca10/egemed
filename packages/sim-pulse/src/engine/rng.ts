export type RandomInt = (maxExclusive: number) => number;

export interface CryptoLike {
  getRandomValues<T extends Uint32Array>(values: T): T;
}

const UINT32_RANGE = 0x1_0000_0000;

export function createCryptoRandomInt(cryptoLike: CryptoLike): RandomInt {
  return (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new RangeError("randomInt sınırı 1 ile 2^32 arasında bir tamsayı olmalı");
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const value = new Uint32Array(1);
    do cryptoLike.getRandomValues(value); while (value[0]! >= limit);
    return value[0]! % maxExclusive;
  };
}

export function createSeededRandomInt(seed: number): RandomInt {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new RangeError("randomInt sınırı 1 ile 2^32 arasında bir tamsayı olmalı");
    }
    // xorshift32 has a full period for every non-zero 32-bit seed.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % maxExclusive;
  };
}
