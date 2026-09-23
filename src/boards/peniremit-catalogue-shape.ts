/**
 * The shape of a Peniremit declaration, and the constructor a generated
 * catalogue calls.
 *
 * Split out so `peniremit-catalogue.generated.ts` — written by
 * `bun run conform --dump-catalogue` — can import the type and the helper
 * without importing the list it is replacing.
 */

export type PeniremitShape = 'aggregate' | 'date' | 'category'

export interface PeniremitDataset {
  id: string
  name: string
  shape: PeniremitShape
  /**
   * Field keys in declaration order. The first is the Dimension for a `date` or
   * `category` Dataset; an `aggregate` one has no Dimension.
   */
  keys: string[]
  /** Measures declared `semantic: additive-total`. Absent where none are. */
  additive?: string[]
  /**
   * Filter Parameters beyond `from`/`to`, which every Dataset here declares.
   *
   * Stated per Dataset rather than assumed from its shape. Assuming them is
   * what made this file wrong about `peniremit.transaction-count-summary`,
   * which declares a `status` taking `success | failed | all` — so a card the
   * guide describes looked impossible and was routed around.
   *
   * The query endpoint refuses any parameter a Dataset did not advertise, so an
   * over-declaration here is a 400 at runtime and an under-declaration hides a
   * card that works.
   */
  params?: string[]
}

/** Every Dataset's `from`/`to`, which none of them omit. */
export const BASE_PARAMS = ['from', 'to']

export const d = (
  id: string,
  name: string,
  shape: PeniremitShape,
  keys: string[],
  extra: { additive?: string[]; params?: string[] } = {},
): PeniremitDataset => ({
  id: `peniremit.${id}`,
  name,
  shape,
  keys,
  ...(extra.additive ? { additive: extra.additive } : {}),
  // Everything grained by date takes `granularity`; the guide is consistent on
  // that and the live declarations agree.
  params: [...(shape === 'date' ? ['granularity'] : []), ...(extra.params ?? [])],
})
