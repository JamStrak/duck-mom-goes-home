// 确定性伪随机数生成器（mulberry32），保证 60 关每次生成结果一致

export type RNG = () => number;

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 返回 [0, n) 的整数 */
export function randInt(rng: RNG, n: number): number {
  return Math.floor(rng() * n);
}

/** 从数组随机取一个元素 */
export function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[randInt(rng, arr.length)] as T;
}

/** Fisher–Yates 洗牌（返回新数组） */
export function shuffle<T>(rng: RNG, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
