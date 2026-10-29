import vine from '@vinejs/vine'

const placeType = vine
  .string()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
  .maxLength(32)
const categoryTypeCode = vine
  .string()
  .regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/)
  .maxLength(32)
const slug = vine
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .maxLength(160)
const httpUrl = vine.string().trim().url().maxLength(500)

export const categoryTypeValidator = vine.compile(
  vine.object({
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: vine.string().trim().maxLength(160).nullable().optional(),
    sortOrder: vine.number().withoutDecimals(),
  })
)

export const newCategoryTypeValidator = vine.compile(
  vine.object({
    code: categoryTypeCode,
    nameEn: vine.string().trim().minLength(2).maxLength(160),
    nameAr: vine.string().trim().maxLength(160).nullable().optional(),
    sortOrder: vine.number().withoutDecimals(),
  })
)

export const categoryValidator = vine.compile(
  vine.object({
    type: placeType,
    slug: slug,
    nameEn: vine.string().minLength(2).maxLength(160),
    nameAr: vine.string().maxLength(160).nullable().optional(),
    sortOrder: vine.number().withoutDecimals().optional(),
    active: vine.boolean().optional(),
  })
)

export const placeValidator = vine.compile(
  vine.object({
    type: placeType,
    slug,
    categoryId: vine.number().positive().withoutDecimals().nullable().optional(),
    titleEn: vine.string().minLength(2).maxLength(200),
    summaryEn: vine.string().minLength(2).maxLength(500),
    addressEn: vine.string().minLength(2).maxLength(300),
    bodyEn: vine.string().maxLength(30000).nullable().optional(),
    hoursNoteEn: vine.string().maxLength(200).nullable().optional(),
    priceUnitEn: vine.string().maxLength(80).nullable().optional(),
    seoTitleEn: vine.string().maxLength(200).nullable().optional(),
    seoDescriptionEn: vine.string().maxLength(300).nullable().optional(),
    titleAr: vine.string().maxLength(200).nullable().optional(),
    summaryAr: vine.string().maxLength(500).nullable().optional(),
    addressAr: vine.string().maxLength(300).nullable().optional(),
    bodyAr: vine.string().maxLength(30000).nullable().optional(),
    priceMode: vine.enum(['unknown', 'free', 'from', 'fixed']).optional(),
    priceAmount: vine
      .string()
      .regex(/^\d{1,7}(?:\.\d{1,3})?$/)
      .nullable()
      .optional(),
    websiteUrl: httpUrl.nullable().optional(),
    latitude: vine.number().range([-90, 90]).nullable().optional(),
    longitude: vine.number().range([-180, 180]).nullable().optional(),
    featured: vine.boolean().optional(),
    featured_order: vine.number().withoutDecimals().min(0).max(9999).nullable().optional(),
    hours: vine
      .array(
        vine.object({
          weekday: vine.number().range([0, 6]).withoutDecimals(),
          intervalIndex: vine.number().min(0).withoutDecimals(),
          opensAt: vine
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .nullable()
            .optional(),
          closesAt: vine
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .nullable()
            .optional(),
          closesNextDay: vine.boolean().optional(),
          closed: vine.boolean().optional(),
        })
      )
      .maxLength(70)
      .optional(),
  })
)

export const pageValidator = vine.compile(
  vine.object({
    slug,
    titleEn: vine.string().minLength(2).maxLength(200),
    bodyEn: vine.string().minLength(1).maxLength(50000),
    eyebrowEn: vine.string().trim().maxLength(120).nullable().optional(),
    bodyFormatEn: vine.enum(['plain_text', 'html']).optional(),
    titleAr: vine.string().maxLength(200).nullable().optional(),
    bodyAr: vine.string().maxLength(50000).nullable().optional(),
    eyebrowAr: vine.string().trim().maxLength(120).nullable().optional(),
    bodyFormatAr: vine.enum(['plain_text', 'html']).optional(),
    seoTitleEn: vine.string().maxLength(200).nullable().optional(),
    seoDescriptionEn: vine.string().maxLength(300).nullable().optional(),
  })
)

export const locationValidator = vine.compile(
  vine.object({
    code: slug,
    nameEn: vine.string().minLength(2).maxLength(180),
    nameAr: vine.string().maxLength(180).nullable().optional(),
    pickupEnabled: vine.boolean(),
    dropoffEnabled: vine.boolean(),
    active: vine.boolean(),
    sortOrder: vine.number().withoutDecimals(),
  })
)

export const settingsValidator = vine.compile(
  vine.object({
    brandName: vine.string().minLength(2).maxLength(120),
    directPhoneNumber: vine
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .nullable()
      .optional(),
    directPhoneDescription: vine.string().trim().maxLength(160).nullable().optional(),
    whatsappNumber: vine
      .string()
      .regex(/^\+?[1-9]\d{7,14}$/)
      .nullable()
      .optional(),
    whatsappDescription: vine.string().trim().maxLength(160).nullable().optional(),
    contactEmail: vine.string().email().maxLength(254).nullable().optional(),
    headquartersName: vine.string().trim().maxLength(160).nullable().optional(),
    headquartersAddress: vine.string().trim().maxLength(300).nullable().optional(),
    headquartersMapUrl: httpUrl.nullable().optional(),
    contactInquiryTypes: vine
      .array(vine.string().trim().minLength(1).maxLength(120))
      .maxLength(20)
      .optional(),
    appStoreUrl: httpUrl.nullable().optional(),
    playStoreUrl: httpUrl.nullable().optional(),
  })
)

export const homeValidator = vine.compile(
  vine.object({
    locale: vine.enum(['en', 'ar']),
    heroEyebrow: vine.string().maxLength(120),
    heroTitle: vine.string().minLength(2).maxLength(200),
    discoveryTitle: vine.string().minLength(2).maxLength(200),
  })
)

const imageText = () => vine.string().trim().maxLength(255).nullable().optional()
const galleryItemFields = () => ({
  altEn: imageText(),
  altAr: imageText(),
  captionEn: imageText(),
  captionAr: imageText(),
  sortOrder: vine.number().min(0).max(999).withoutDecimals().optional(),
})

/** Edits to existing gallery images submitted with the CMS place form. */
export const galleryItemsValidator = vine.compile(
  vine.object({
    items: vine
      .array(
        vine.object({
          id: vine.number().positive().withoutDecimals(),
          ...galleryItemFields(),
          remove: vine.boolean().optional(),
        })
      )
      .maxLength(20),
  })
)

export const galleryImageUpdateValidator = vine.compile(vine.object(galleryItemFields()))

/** Optional English alternative text applied to newly uploaded gallery images. */
export const galleryUploadValidator = vine.compile(vine.object({ altEn: imageText() }))
