import db from '@adonisjs/lucid/services/db'
import { ApiError } from '#services/api_error'
import { withStoredImages, type PreparedImage } from '#services/image_storage_service'

/** `undefined` keeps the current image, `'remove'` clears it. */
type ImageChange = PreparedImage | 'remove' | undefined

type SettingsInput = {
  brandName?: string
  directPhoneNumber?: string | null
  directPhoneDescription?: string | null
  whatsappNumber?: string | null
  whatsappDescription?: string | null
  contactEmail?: string | null
  headquartersName?: string | null
  headquartersAddress?: string | null
  headquartersMapUrl?: string | null
  contactInquiryTypes?: string[]
  appStoreUrl?: string | null
  playStoreUrl?: string | null
}

type HomeInput = {
  heroEyebrow: string
  heroTitle: string
  discoveryEyebrow?: string
  discoveryTitle: string
  discoveryDescription?: string
  appTitle?: string | null
  appBody?: string | null
}

function newImage(image: ImageChange) {
  return image && image !== 'remove' ? [image] : []
}

function nextKey(current: string | null | undefined, key: string | undefined, image: ImageChange) {
  return key ?? (image === 'remove' ? null : (current ?? null))
}

function httpUrl(value?: string | null) {
  if (value && !['http:', 'https:'].includes(new URL(value).protocol)) {
    throw new ApiError(422, 'INVALID_URL', 'Links must use HTTP or HTTPS')
  }
  return value ?? null
}

async function writeSettings(input: SettingsInput | null, logo: ImageChange, actorId: number) {
  await withStoredImages(newImage(logo), async ([key]) => {
    const released: string[] = []
    await db.transaction(async (trx) => {
      const existing = await trx.from('site_settings').where('id', 1).forUpdate().first()
      const logoKey = nextKey(existing?.logo_image_key, key, logo)
      if (existing?.logo_image_key && existing.logo_image_key !== logoKey) {
        released.push(existing.logo_image_key)
      }
      const fields = {
        ...(input
          ? {
              ...(input.brandName !== undefined ? { brand_name: input.brandName } : {}),
              ...(input.directPhoneNumber !== undefined
                ? { direct_phone_number: input.directPhoneNumber }
                : {}),
              ...(input.directPhoneDescription !== undefined
                ? { direct_phone_description: input.directPhoneDescription }
                : {}),
              ...(input.whatsappNumber !== undefined
                ? { whatsapp_number: input.whatsappNumber }
                : {}),
              ...(input.whatsappDescription !== undefined
                ? { whatsapp_description: input.whatsappDescription }
                : {}),
              ...(input.contactEmail !== undefined ? { contact_email: input.contactEmail } : {}),
              ...(input.headquartersName !== undefined
                ? { headquarters_name: input.headquartersName }
                : {}),
              ...(input.headquartersAddress !== undefined
                ? { headquarters_address: input.headquartersAddress }
                : {}),
              ...(input.headquartersMapUrl !== undefined
                ? { headquarters_map_url: httpUrl(input.headquartersMapUrl) }
                : {}),
              ...(input.contactInquiryTypes !== undefined
                ? { contact_inquiry_types: JSON.stringify(input.contactInquiryTypes) }
                : {}),
              ...(input.appStoreUrl !== undefined
                ? { app_store_url: httpUrl(input.appStoreUrl) }
                : {}),
              ...(input.playStoreUrl !== undefined
                ? { play_store_url: httpUrl(input.playStoreUrl) }
                : {}),
            }
          : {}),
        logo_image_key: logoKey,
        updated_at: new Date(),
      }
      if (existing) await trx.from('site_settings').where('id', 1).update(fields)
      else
        await trx
          .table('site_settings')
          .insert({ id: 1, brand_name: input?.brandName ?? 'The Kuwaiti Experience', ...fields })
      await trx.table('audit_logs').insert({
        actor_id: actorId,
        action: 'site.settings.updated',
        entity_type: 'site_settings',
        entity_id: '1',
        created_at: new Date(),
      })
    })
    return { result: undefined, released }
  })
}

async function writeHome(
  locale: 'en' | 'ar',
  input: HomeInput | null,
  hero: ImageChange,
  actorId: number
) {
  await withStoredImages(newImage(hero), async ([key]) => {
    const released: string[] = []
    await db.transaction(async (trx) => {
      const existing = await trx.from('home_content').where('locale', locale).forUpdate().first()
      const heroKey = nextKey(existing?.hero_image_key, key, hero)
      if (existing?.hero_image_key && existing.hero_image_key !== heroKey) {
        released.push(existing.hero_image_key)
      }
      const fields = {
        ...(input
          ? {
              hero_eyebrow: input.heroEyebrow,
              hero_title: input.heroTitle,
              ...(input.discoveryEyebrow !== undefined
                ? { discovery_eyebrow: input.discoveryEyebrow }
                : {}),
              discovery_title: input.discoveryTitle,
              ...(input.discoveryDescription !== undefined
                ? { discovery_description: input.discoveryDescription }
                : {}),
              ...(input.appTitle !== undefined ? { app_title: input.appTitle } : {}),
              ...(input.appBody !== undefined ? { app_body: input.appBody } : {}),
            }
          : {}),
        hero_image_key: heroKey,
        updated_at: new Date(),
      }
      if (existing) await trx.from('home_content').where('locale', locale).update(fields)
      else await trx.table('home_content').insert({ locale, ...fields })
      await trx.table('audit_logs').insert({
        actor_id: actorId,
        action: 'home.updated',
        entity_type: 'home_content',
        entity_id: locale,
        created_at: new Date(),
      })
    })
    return { result: undefined, released }
  })
}

export async function saveSettings(input: SettingsInput, actorId: number, logo?: ImageChange) {
  await writeSettings(input, logo, actorId)
}

export async function setLogo(logo: PreparedImage | 'remove', actorId: number) {
  await writeSettings(null, logo, actorId)
}

export async function saveHome(
  input: HomeInput & { locale: 'en' | 'ar' },
  actorId: number,
  hero?: ImageChange
) {
  await writeHome(input.locale, input, hero, actorId)
}

export async function setHeroImage(
  locale: 'en' | 'ar',
  hero: PreparedImage | 'remove',
  actorId: number
) {
  await writeHome(locale, null, hero, actorId)
}
