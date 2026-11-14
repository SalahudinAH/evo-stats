/**
 * Look up or search packaged foods in Open Food Facts, the free, open food
 * database (https://world.openfoodfacts.org). Values are per 100 g.
 */
export interface ScannedProduct {
  barcode: string
  name: string
  brand: string | null
  /** Per 100 g. Null when the product has no nutrition facts yet. */
  per100: { kcal: number; protein: number; carbs: number; fat: number } | null
  /** Grams in one serving, if the package says. */
  servingGrams: number | null
  servingLabel: string | null
}

type OffNutriments = Record<string, number | string | undefined>

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

const FIELDS = 'code,product_name,product_name_nb,product_name_no,product_name_en,brands,serving_size,serving_quantity,nutriments'

function toProduct(barcode: string, p: Record<string, unknown>): ScannedProduct {
  const n = (p.nutriments ?? {}) as OffNutriments
  // energy_100g / energy-kj_100g are kJ; 1 kcal = 4.184 kJ.
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g'])
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / 4.184 : null)
  const per100 = kcal === null ? null : {
    kcal: Math.round(kcal),
    protein: Math.round((num(n.proteins_100g) ?? 0) * 10) / 10,
    carbs: Math.round((num(n.carbohydrates_100g) ?? 0) * 10) / 10,
    fat: Math.round((num(n.fat_100g) ?? 0) * 10) / 10,
  }
  const name = [p.product_name_nb, p.product_name_no, p.product_name, p.product_name_en]
    .find(v => typeof v === 'string' && v.trim()) as string | undefined
  const brand = typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim() : null
  return {
    barcode,
    name: name?.trim() ?? 'Unnamed product',
    brand,
    per100,
    servingGrams: num(p.serving_quantity) || null,
    servingLabel: typeof p.serving_size === 'string' && p.serving_size.trim() ? p.serving_size.trim() : null,
  }
}

/** Returns null when the barcode isn't in the database. Throws on network errors. */
export async function lookupBarcode(barcode: string): Promise<ScannedProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  const data = await res.json() as { status?: number; product?: Record<string, unknown> }
  if (data.status === 0 || !data.product) return null
  return toProduct(barcode, data.product)
}

export class TooManySearches extends Error {}
const searchCache = new Map<string, ScannedProduct[]>()

/**
 * Search Open Food Facts by name, products sold in Norway first (all countries if none match).
 * Their search allows about 10 requests a minute, so callers should debounce; results are cached.
 * Only products with nutrition facts are returned.
 */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<ScannedProduct[]> {
  const q = query.trim().toLowerCase()
  if (searchCache.has(q)) return searchCache.get(q)!
  const run = async (norway: boolean) => {
    const params = new URLSearchParams({ search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '24', fields: FIELDS })
    if (norway) { params.set('tagtype_0', 'countries'); params.set('tag_contains_0', 'contains'); params.set('tag_0', 'norway') }
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { signal })
    if (res.status === 429 || res.status === 503) throw new TooManySearches('Open Food Facts is busy. Try again in a minute.')
    if (!res.ok) throw new Error(`Search failed (${res.status})`)
    const data = await res.json() as { products?: Record<string, unknown>[] }
    return (data.products ?? [])
      .filter(p => typeof p.code === 'string' && p.code)
      .map(p => toProduct(p.code as string, p))
      .filter(p => p.per100 && p.per100.kcal > 0)
  }
  let list = await run(true)
  if (!list.length) list = await run(false)
  searchCache.set(q, list)
  return list
}
