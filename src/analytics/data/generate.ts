/**
 * Deterministic row generation.
 *
 * Seeded rather than random so a widget looks identical between runs. That
 * matters more than it sounds: when the work is judging whether one bar
 * treatment reads better than another, data shifting underneath you makes the
 * comparison worthless, and screenshots stop being comparable.
 */

/** mulberry32 — small, fast, good enough for shaping mock data. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}

export function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min)
}

export function intBetween(random: () => number, min: number, max: number): number {
  return Math.round(between(random, min, max))
}

/**
 * A value walking upward with noise, weekly seasonality and the occasional
 * spike — flat noise reads as broken, and a clean sine reads as fake.
 */
export function trendingSeries(
  random: () => number,
  options: {
    length: number
    start: number
    driftPerStep?: number
    noise?: number
    weekly?: number
    spikeChance?: number
  },
): number[] {
  const { length, start, driftPerStep = 0, noise = 0.06, weekly = 0, spikeChance = 0 } = options

  const values: number[] = []
  let level = start

  for (let step = 0; step < length; step += 1) {
    level += driftPerStep
    const wobble = 1 + (random() - 0.5) * 2 * noise
    const season = weekly === 0 ? 1 : 1 + Math.sin((step / 7) * Math.PI * 2) * weekly
    const spike = spikeChance > 0 && random() < spikeChance ? between(random, 1.3, 1.9) : 1
    values.push(Math.max(0, level * wobble * season * spike))
  }

  return values
}

/** ISO dates counting back from `end`, oldest first. */
export function daysEndingAt(end: string, count: number): string[] {
  const last = new Date(`${end}T00:00:00Z`)
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(last)
    day.setUTCDate(last.getUTCDate() - (count - 1 - index))
    return day.toISOString().slice(0, 10)
  })
}

/** `YYYY-MM` counting back from `end`, oldest first. */
export function monthsEndingAt(end: string, count: number): string[] {
  const [year, month] = end.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const offset = month - 1 - (count - 1 - index)
    const y = year + Math.floor(offset / 12)
    const m = ((offset % 12) + 12) % 12
    return `${y}-${String(m + 1).padStart(2, '0')}`
  })
}
