# Website frontend API reference

Last verified against routes, serializers and OpenAPI: **21 October 2026**. This is the website integration contract for the four footer destinations. The Contact Us implementation mapping for the supplied UI is documented separately in [Contact Us frontend implementation reference](contact-us-frontend-reference.md). Screenshot values are visual examples, not approved production content.

## The four footer links

| Link | Public API | CMS owner |
| --- | --- | --- |
| Contact Us | `GET /api/v2/site` for contact channels; `POST /api/v2/contact-requests` for an enquiry; `GET /api/v2/pages/contact-us?locale=en` if editorial page copy is needed | Site settings, Contact requests inbox, optional Pages entry |
| About Us | `GET /api/v2/pages/about-us?locale=en` | Pages entry `about-us` |
| Terms & Conditions | `GET /api/v2/pages/terms-and-conditions?locale=en` | Pages entry `terms-and-conditions` |
| Privacy Policy | `GET /api/v2/pages/privacy-policy?locale=en` | Pages entry `privacy-policy` |

All reads are public. The contact form accepts a guest or an optionally authenticated customer. Configure an API origin for each environment and prepend it to these paths. Use `Accept: application/json`; send `Content-Type: application/json` for contact submission. The only page query parameter is `locale=en` or `locale=ar`; omission selects English.

The older `GET /api/v1/pages/{slug}` route still exists for existing website consumers. It flattens a Page into different keys. **Use v2 for all four new footer integrations** so the website, app and v2 CMS share one database-key `Page` model. Do not mix v1 and v2 page shapes in one typed interface.

## Shared page response

Every successful `GET /api/v2/pages/{slug}` returns HTTP 200 with the **same** `Page`, `PageTranslation` and `PageMeta` structure, independent of slug. This example is illustrative; it is not approved development content:

```json
{
  "data": {
    "id": 1,
    "slug": "about-us",
    "status": "published",
    "published_at": "2026-10-21T06:00:00.000Z",
    "created_at": "2026-10-21T05:00:00.000Z",
    "updated_at": "2026-10-21T06:00:00.000Z",
    "page_translations": [
      {
        "id": 1,
        "page_id": 1,
        "locale": "en",
        "title": "About The Kuwaiti Experience",
        "eyebrow": "ABOUT THE KUWAITI EXPERIENCE",
        "body": "<h2>The Essence of Kuwaiti Hospitality</h2><p>Example approved CMS copy.</p>",
        "body_format": "html",
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

`data` is a complete `Page`: `id` (integer), `slug` (string), `status` (`published`), `published_at` and `created_at` (UTC ISO strings), `updated_at` (UTC ISO string or null), and `page_translations` (array). Every translation always has `id`, `page_id` (integers), `locale` (`en` or `ar`), `title` and `body` (strings), nullable `eyebrow`, `body_format` (`plain_text` or `html`), and nullable `seo_title` and `seo_description`. Nullable keys remain present. Use these exact entity keys in website, app and CMS models.

`meta.locale` is the actual selected translation: requested Arabic when available, otherwise English. The response still includes **all** stored translations ordered by locale. Select the row whose `locale` matches `meta.locale`; do not assume an array position or an Arabic row. `meta.content_hash` is a 64-character SHA-256 digest of the selected slug, locale, title and body. It is protocol metadata, not a database field. Reading a legal page does not record consent; the app handles legal acceptance separately from registration.

For the supplied header, use the selected translation's `eyebrow` and `title`. Format `data.updated_at ?? data.published_at` as the “Last updated” month and year in the display locale; the API returns ISO timestamps and does not rename them. For the content panel, use `body_format`: render `plain_text` as escaped text with line breaks, and render `html` as sanitized rich content with headings, paragraphs, lists, emphasis and links. The server strips scripts, event attributes, unsafe URLs, images and unsupported tags on write and read. Do not treat the HTML string as safe for attributes or scripts. Use nullable SEO values only when present.

### Page errors

| HTTP | `error.code` | Meaning |
| --- | --- | --- |
| 404 | `NOT_FOUND` | Slug absent; page in draft/archive; future publication time; or no usable translation. |
| 503 | `LEGAL_CONTENT_UNAVAILABLE` | Only for the Terms or Privacy slug when recognized demo/placeholder legal text was published. |
| 500 | `INTERNAL_ERROR` | Server failure; retain `error.requestId` for diagnosis. |

Errors have `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`; validation errors can also have `fields`. Check HTTP status before reading `data`. The API does not return an empty Page on 404. Editorial review is required before publishing **any** page; the automatic placeholder guard applies only to the two legal slugs.

## Contact channels: `GET /api/v2/site`

This returns HTTP 200 with `data: SiteSettings` and `meta.images`. Authenticated `GET /api/v2/admin/site` returns the **same shape**. The Contact Us screen uses the direct call, WhatsApp, email, headquarters/map, and inquiry-type fields. Hide a channel when its destination is null; never substitute screenshot/example values.

```json
{
  "data": {
    "id": 1,
    "brand_name": "The Kuwaiti Experience",
    "direct_phone_number": null,
    "direct_phone_description": null,
    "whatsapp_number": null,
    "whatsapp_description": null,
    "contact_email": null,
    "headquarters_name": null,
    "headquarters_address": null,
    "headquarters_map_url": null,
    "contact_inquiry_types": [],
    "app_store_url": null,
    "play_store_url": null,
    "logo_image_key": null,
    "updated_at": null
  },
  "meta": { "images": [] }
}
```

All `SiteSettings` keys above are always present. Nullable values remain null and `contact_inquiry_types` is always an array. Construct `tel:`, `mailto:`, and `https://wa.me/<digits-only number>` links in the client and use the validated map URL directly. Resolve a non-null `logo_image_key` through `meta.images` against the API origin.

## Contact form: `POST /api/v2/contact-requests`

Send JSON using database field names:

```json
{
  "full_name": "Mariam Al-Khaled",
  "email": "mariam@example.com",
  "phone_number": "+96599998888",
  "inquiry_type": "Corporate & Event Transport",
  "message": "Please help with my enquiry"
}
```

`full_name`, `email`, and `message` are required. `phone_number` and `inquiry_type` are optional/null. Phone input uses 8–15 digits with an optional leading `+`; inquiry type is limited to 120 characters. The backend lowercases email. A guest needs no bearer token; an authenticated customer may send a valid customer bearer token. There is no public contact inbox or enquiry status endpoint.

Success is HTTP 201 with a **submission receipt**, not a partial `ContactRequest` entity:

```json
{ "data": { "id": 1, "created_at": "2026-10-21T06:00:00.000Z" } }
```

Validation failures return 422 with the standard error envelope; the per-IP limit of five submissions per hour returns 429. An invalid supplied bearer token returns 401. The response uses `Cache-Control: no-store`. Do not automatically retry a timed-out submission because it may already have been saved. See the [Contact Us frontend implementation reference](contact-us-frontend-reference.md) for card, form, locale, accessibility, and state mapping.

## CMS readiness and integration

The existing CMS supports editing and publishing these exact slugs at `/admin/pages`, including localized `eyebrow` and Quill rich-text body fields. It manages contact channels at `/admin/settings` and enquiries at `/admin/contact-requests`. The optional `contact-us` Page supplies editorial text; the enquiry API works independently of that page. Existing plain-text page rows remain `body_format: "plain_text"` until an editor saves them in Quill.

As of **21 October 2026**, the local development data does **not** yet match the visible copy in the supplied screenshots:

| Page | Current stored values | Needed for the shown UI |
| --- | --- | --- |
| About Us | Draft; English title `About Us`; `eyebrow: null`; plain placeholder body | Set the approved title (`About The Kuwaiti Experience` if final), intro label and section content in Quill, then publish. |
| Terms & Conditions | Draft; English title `Terms and Conditions`; `eyebrow: null`; plain placeholder body | Set the final title punctuation, `LEGAL & POLICIES` intro label and approved legal sections in Quill, then publish. |
| Privacy Policy | Draft; English title `Privacy Policy`; `eyebrow: null`; plain placeholder body | Confirm its distinct UI/copy, enter approved policy content, then publish. |
| Contact Us | Draft; English title `Contact Us`; `eyebrow: null`; plain placeholder body | Editorial page copy remains optional. Configure approved direct call, WhatsApp, email, headquarters/map and inquiry choices in Site settings before launch. |

All four public page reads currently return 404. The stored `updated_at` is **8 October 2026**, which can format as “October 2026,” but these draft pages must not be shown publicly. Approved text must replace the placeholders before publishing; CMS publication now rejects known placeholder copy. `contact_email` and `whatsapp_number` are currently null in local Site settings, so contact channel buttons have no destination yet. Contact form submissions can still be accepted. The supplied legal screenshot text is a UI example, not approved policy copy.

Reuse one `Page` type for all four page slugs and one `SiteSettings` type for both public and v2 admin reads. Generate these from [Customer OpenAPI](customer-openapi.json) `Page`, `PageTranslation`, `PageMeta`, `SiteSettings`, `SiteSettingsMeta` and `ContactReceipt`. The [Postman collection](postman/kuwaitiexperience.postman_collection.json) includes all four page reads, Site settings and guest/customer contact submission requests. The [legacy website examples](frontend-api-responses.md) describe v1 responses for existing consumers; use this document for new footer integration.
