export type Rng = () => number;

/** Deterministic 0..1 generator from a string seed. */
export function createRng(seed: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function randomInt(rng: Rng, min: number, max: number): number {
  if (max < min) {
    throw new Error(`randomInt: max (${max}) < min (${min})`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}
