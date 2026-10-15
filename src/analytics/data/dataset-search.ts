/**
 * Finding one data source among many, by name or description.
 *
 * Shared between the composer's step one and the Data sources screen, because
 * both show the same list of sources and both get unwieldy past a handful of
 * them — the composer's catalogue grows with every Dataset a product team
 * publishes, same as the library screen's does.
 */

/** Data sources whose name or description mentions the search term. */
export function matchingDatasets<T extends { name: string; description: string }>(
  datasets: readonly T[],
  query: string,
): T[] {
  const term = query.trim().toLowerCase()
  if (!term) return [...datasets]
  return datasets.filter(
    (entry) =>
      entry.name.toLowerCase().includes(term) || entry.description.toLowerCase().includes(term),
  )
}
