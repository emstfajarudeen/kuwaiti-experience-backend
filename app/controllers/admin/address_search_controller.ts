import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import limiter from '@adonisjs/limiter/services/main'

type PhotonFeature = {
  properties?: Record<string, unknown>
  geometry?: { coordinates?: number[] }
}

type AddressResult = {
  id: string
  label: string
  latitude: number
  longitude: number
}

const cache = new Map<string, { expiresAt: number; results: AddressResult[] }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_LIMIT = 200

function toAddressResult(feature: PhotonFeature): AddressResult | null {
  const coordinates = feature.geometry?.coordinates
  const longitude = coordinates?.[0]
  const latitude = coordinates?.[1]
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null

  const properties = feature.properties ?? {}
  const parts = [
    properties.name,
    [properties.housenumber, properties.street].filter(Boolean).join(' '),
    properties.district,
    properties.locality,
    properties.city,
    properties.county,
    properties.state,
    properties.postcode,
    properties.country,
  ].filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
  const label = [...new Set(parts.map((part) => part.trim()))].join(', ').slice(0, 300)
  if (!label) return null
  return {
    id:
      String(properties.osm_type ?? 'place') +
      ':' +
      String(properties.osm_id ?? `${latitude},${longitude}`),
    label,
    latitude,
    longitude,
  }
}

async function queryPhoton(cacheKey: string, path: string, params: Record<string, string>) {
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return { results: cached.results }

  try {
    await limiter.use({ requests: 60, duration: '1 minute' }).consume('cms-photon-global')
  } catch {
    return { error: 'Map search is busy. Please try again shortly.', status: 429 }
  }

  const url = new URL(path, env.get('PHOTON_BASE_URL') || 'https://photon.komoot.io')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': `TheKuwaitiExperienceCMS/1.0 (${env.get('APP_URL')})`,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!upstream.ok) throw new Error(`Photon returned ${upstream.status}`)
    const data = (await upstream.json()) as { features?: PhotonFeature[] }
    if (!Array.isArray(data.features)) throw new Error('Invalid Photon response')
    const results = data.features.flatMap((feature) => {
      const result = toAddressResult(feature)
      return result ? [result] : []
    })
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value ?? '')
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results })
    return { results }
  } catch {
    return {
      error: 'Map search is unavailable right now. You can enter the address manually.',
      status: 503,
    }
  }
}

export default class AdminAddressSearchController {
  async search({ request, response }: HttpContext) {
    const query = String(request.input('q', '')).replace(/\s+/g, ' ').trim()
    if (query.length < 3 || query.length > 160) {
      return response.status(422).send({ error: 'Enter 3 to 160 characters to search.' })
    }
    const result = await queryPhoton(`search:${query.toLocaleLowerCase('en')}`, '/api', {
      q: query,
      lat: '29.3759',
      lon: '47.9774',
      zoom: '8',
      limit: '5',
      lang: 'en',
    })
    return 'error' in result
      ? response.status(result.status ?? 503).send({ error: result.error })
      : result
  }

  async reverse({ request, response }: HttpContext) {
    const rawLat = request.input('lat')
    const rawLon = request.input('lon')
    const latitude = Number(rawLat)
    const longitude = Number(rawLon)
    if (
      rawLat === undefined ||
      rawLon === undefined ||
      rawLat === '' ||
      rawLon === '' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return response.status(422).send({ error: 'Choose a valid point on the map.' })
    const result = await queryPhoton(
      `reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`,
      '/reverse',
      {
        lat: String(latitude),
        lon: String(longitude),
        radius: '0.5',
        limit: '1',
        lang: 'en',
      }
    )
    return 'error' in result
      ? response.status(result.status ?? 503).send({ error: result.error })
      : { result: result.results[0] ?? null }
  }
}
