# Website frontend API reference

Last checked against routes, serializers, OpenAPI and the local development database: **21 October 2026**. This reference currently covers the website's Privacy Policy and Terms and Conditions data. The website UI is not confirmed, so no page layout, route, navigation or consent interaction is specified here.

## Legal pages: implementation status

The backend already has public legal-page APIs. For new website integration use the **canonical v2 endpoint**, which returns the same database-key `Page` and `PageTranslation` models used by the mobile app:

| Content | Request | Authentication |
| --- | --- | --- |
| Privacy Policy | `GET /api/v2/pages/privacy-policy?locale=en` | None |
| Terms and Conditions | `GET /api/v2/pages/terms-and-conditions?locale=en` | None |

Configure the API origin per environment and prepend it to these paths. Locally the default origin is `http://localhost:3333`; a physical device or deployed website must use an origin reachable from its browser. Send `Accept: application/json`. The only query parameter is `locale=en` or `locale=ar`; omitted locale selects English. No request body, customer token or admin cookie is needed.

The older website route `GET /api/v1/pages/{slug}` also exists. It flattens a localized page into `title`, `body` and a nested `seo` object, so it does not match the shared database-key model. New website code should use `/api/v2/pages/{slug}`. The API version is part of the integration contract; do not combine v1 and v2 page types in one frontend model.

## Successful response: HTTP 200

The response always has `data` and `meta`. This **illustrative** JSON shows the wire shape after approved content has been published; it is not the text currently stored in the development database:

```json
{
  "data": {
    "id": 1,
    "slug": "privacy-policy",
    "status": "published",
    "published_at": "2026-10-21T06:00:00.000Z",
    "created_at": "2026-10-21T05:00:00.000Z",
    "updated_at": "2026-10-21T06:00:00.000Z",
    "page_translations": [
      {
        "id": 1,
        "page_id": 1,
        "locale": "en",
        "title": "Privacy Policy",
        "body": "Example only: approved CMS text appears here.",
        "seo_title": null,
        "seo_description": null
      }
    ]
  },
  "meta": {
    "locale": "en",
    "content_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

`data` is a complete `Page`, with **all** persisted public keys: `id` (integer), `slug` (string), `status` (`published`), `published_at` and `created_at` (UTC ISO strings), `updated_at` (UTC ISO string or null), and `page_translations` (array). Every `PageTranslation` has `id` and `page_id` (integers), `locale` (`en` or `ar`), `title` and `body` (strings), and `seo_title` and `seo_description` (strings or null). Nullable keys remain present. Reuse these exact model shapes anywhere the website, app or v2 admin read returns them; do not rename `page_translations` or put SEO fields under a new entity key.

`meta.locale` is the **actual selected translation**. The API selects the requested Arabic row if it exists; otherwise it selects English. It still returns every stored translation in `data.page_translations`, ordered by locale. Find the row whose `locale` equals `meta.locale` for title, body and SEO fields. Do not assume the first array item is English or that an Arabic row exists. If a selected row's SEO fields are null, they remain null; the API does not replace them with English SEO fields.

`meta.content_hash` is a 64-character lowercase SHA-256 digest for the selected slug, locale, title and body. It changes when that content changes. It is metadata, not a property of the `pages` table and not a display string. The website's legal-page UI and consent behavior are still to be decided; the read API does not record acceptance.

Render `body` as **escaped text**, preserving its line breaks. It is CMS text, not trusted HTML. Use `seo_title` and `seo_description` only when present. The backend does not prescribe where the website places the title, body, SEO tags or links.

## Error and empty states

| HTTP | `error.code` | Meaning for the website |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Slug absent, page in draft/archive, publication time in the future, or no usable translation. |
| 503 | `LEGAL_CONTENT_UNAVAILABLE` | A recognized legal slug contains known demo/placeholder text even though published. Do not display it as an approved policy. |
| 500 | `INTERNAL_ERROR` | Server failure; record `error.requestId` for diagnosis. |

Errors use `{ "error": { "code": "...", "message": "...", "requestId": "...", "fields": ... } }`; `fields` is optional. Check HTTP status before decoding a successful page. A legal-page request does not return an empty `Page` on 404.

As of **21 October 2026**, the local `kuwaitiexperience_dev` database has both `privacy-policy` and `terms-and-conditions` as **draft**, each with only an English translation. Therefore the public endpoints currently return 404 for those records. Approved content must be entered and published through the existing CMS **Pages** editor at `/admin/pages` before the website can display them. The screenshot text and demo copy are not approved legal content. No website UI work is implied by publishing.

## Integration example

```ts
type LegalSlug = 'privacy-policy' | 'terms-and-conditions'
type Locale = 'en' | 'ar'

async function readLegalPage(apiOrigin: string, slug: LegalSlug, locale: Locale) {
  const url = new URL(`/api/v2/pages/${slug}`, apiOrigin)
  url.searchParams.set('locale', locale)
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  const payload = await response.json()
  if (!response.ok) throw payload.error
  const selected = payload.data.page_translations.find(
    (translation: { locale: Locale }) => translation.locale === payload.meta.locale
  )
  return { page: payload.data, selected, meta: payload.meta }
}
```

Generate strict types from [Customer OpenAPI](customer-openapi.json) `components.schemas.Page`, `PageTranslation`, and `PageMeta`, or define those models once from the field list above. The existing [Postman collection](postman/kuwaitiexperience.postman_collection.json) has both v2 legal requests in folder 01. The [legacy website response examples](frontend-api-responses.md) document v1 for existing consumers; use this reference for new legal-page integration.
