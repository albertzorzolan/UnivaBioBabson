import { KEYS, load, save } from './storage'

/**
 * Optional read-only lookup against OpenFDA's public drug-label API.
 * Only the drug name is ever sent — never any patient data.
 */

export interface LabelInfo {
  query: string
  brandName?: string
  genericName?: string
  geriatricUse?: string
  interactions?: string
  warnings?: string
  fetchedAt: string
}

const ENDPOINT = 'https://api.fda.gov/drug/label.json'

function firstText(v: unknown): string | undefined {
  if (!Array.isArray(v) || typeof v[0] !== 'string') return undefined
  const text = v[0].replace(/\s+/g, ' ').trim()
  return text.length > 700 ? `${text.slice(0, 700).trimEnd()}…` : text
}

/** "Lorazepam 0.5 mg tablet" -> "lorazepam" */
export function drugQueryName(medName: string): string {
  return medName.toLowerCase().replace(/[^a-z\s-]/g, ' ').trim().split(/\s+/)[0] ?? ''
}

export async function lookupLabel(medName: string): Promise<LabelInfo | null> {
  const q = drugQueryName(medName)
  if (!q) return null

  const cache = load<Record<string, LabelInfo | null>>(KEYS.fdaCache, {})
  if (q in cache) return cache[q]

  const search = `openfda.generic_name:"${q}" openfda.brand_name:"${q}"`
  const res = await fetch(`${ENDPOINT}?search=${encodeURIComponent(search)}&limit=1`)
  if (res.status === 404) {
    // OpenFDA returns 404 when there are no matches
    save(KEYS.fdaCache, { ...cache, [q]: null })
    return null
  }
  if (!res.ok) throw new Error(`OpenFDA returned ${res.status}`)

  const data = await res.json()
  const r = data?.results?.[0]
  if (!r) return null
  const info: LabelInfo = {
    query: q,
    brandName: r.openfda?.brand_name?.[0],
    genericName: r.openfda?.generic_name?.[0],
    geriatricUse: firstText(r.geriatric_use),
    interactions: firstText(r.drug_interactions),
    warnings: firstText(r.warnings_and_cautions ?? r.warnings ?? r.boxed_warning),
    fetchedAt: new Date().toISOString(),
  }
  save(KEYS.fdaCache, { ...cache, [q]: info })
  return info
}
