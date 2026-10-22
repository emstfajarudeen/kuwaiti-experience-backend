# Contact Us frontend implementation reference

This document maps the supplied web Contact Us UI to the visitor-facing API. Use the v2 endpoints below; do not use the legacy v1 Site/Page shapes.

## API overview

| Purpose                                      | Method and path                          | Authentication                        |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| Contact cards and inquiry choices            | `GET /api/v2/site`                       | Public                                |
| Optional CMS-managed Contact Us heading/body | `GET /api/v2/pages/contact-us?locale=en` | Public                                |
| Submit “Send Us a Message”                   | `POST /api/v2/contact-requests`          | Guest; optional customer bearer token |

Set the API origin per environment. Send `Accept: application/json` for every request and `Content-Type: application/json` for submission. Contact submission is limited to five requests per client IP per hour.

## 1. Load the screen

Fetch Site settings and the optional Contact Us Page in parallel. A missing/unpublished Page returns 404 and must not disable the contact cards or form; those depend on Site settings and the submission endpoint.

```ts
export type SiteSettings = {
  id: 1
  brand_name: string
  direct_phone_number: string | null
  direct_phone_description: string | null
  whatsapp_number: string | null
  whatsapp_description: string | null
  contact_email: string | null
  headquarters_name: string | null
  headquarters_address: string | null
  headquarters_map_url: string | null
  contact_inquiry_types: string[]
  app_store_url: string | null
  play_store_url: string | null
  logo_image_key: string | null
  updated_at: string | null
}

type SiteResponse = {
  data: SiteSettings
  meta: {
    images: Array<{ storage_key: string; url: string }>
  }
}
```

Example response; values are illustrative and must come from CMS Site settings:

```json
{
  "data": {
    "id": 1,
    "brand_name": "The Kuwaiti Experience",
    "direct_phone_number": "+96599998888",
    "direct_phone_description": "24/7 Dispatch & Support",
    "whatsapp_number": "+96599998888",
    "whatsapp_description": "Instant Live Assistance",
    "contact_email": "info@example.com",
    "headquarters_name": "Kuwait City, Kuwait",
    "headquarters_address": "Approved office address",
    "headquarters_map_url": "https://maps.example.com/approved-location",
    "contact_inquiry_types": ["Corporate & Event Transport"],
    "app_store_url": null,
    "play_store_url": null,
    "logo_image_key": null,
    "updated_at": "2026-10-21T06:00:00.000Z"
  },
  "meta": { "images": [] }
}
```

All contact destination fields are nullable and always present. `contact_inquiry_types` is always an array and can be empty. Do not display example values as fallbacks.

## 2. Map the four contact cards

The card titles, action labels, icons, and localized presentational copy belong to the frontend. Destinations and CMS-managed descriptions come from `GET /api/v2/site`.

| Supplied UI card   | Display values                                    | Action                                   | Empty state                                                                              |
| ------------------ | ------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Direct Call        | `direct_phone_number`, `direct_phone_description` | `href="tel:<direct_phone_number>"`       | Hide when number is null                                                                 |
| WhatsApp Concierge | `whatsapp_number`, `whatsapp_description`         | `https://wa.me/<digits-only-number>`     | Hide when number is null                                                                 |
| Email Inquiries    | `contact_email`                                   | `href="mailto:<contact_email>"`          | Hide when email is null                                                                  |
| Headquarters       | `headquarters_name`, `headquarters_address`       | Open `headquarters_map_url` in a new tab | Hide the action when URL is null; hide the card when name, address, and URL are all null |

Normalize links client-side without changing displayed values:

```ts
const digitsOnly = (value: string) => value.replace(/\D/g, '')
const whatsappHref = settings.whatsapp_number
  ? `https://wa.me/${digitsOnly(settings.whatsapp_number)}`
  : null
const phoneHref = settings.direct_phone_number ? `tel:${settings.direct_phone_number}` : null
```

For links opened in a new tab, use `rel="noopener noreferrer"`. Give icon-only elements accessible labels; the visible card action should be keyboard reachable.

## 3. Form fields

Map the supplied form as follows:

| UI field      | JSON key       | Required | Contract                                                                              |
| ------------- | -------------- | -------- | ------------------------------------------------------------------------------------- |
| Full Name     | `full_name`    | Yes      | Trimmed string, 1–120 characters                                                      |
| Email Address | `email`        | Yes      | Valid email, maximum 254 characters                                                   |
| Phone Number  | `phone_number` | No       | `null` or 8–15 digits with optional leading `+`; remove display spaces before sending |
| Inquiry Type  | `inquiry_type` | No       | `null` or trimmed string, 1–120 characters                                            |
| Your Message  | `message`      | Yes      | Trimmed string, 1–300 characters                                                      |

Populate the Inquiry Type select from `contact_inquiry_types`. If the array is empty, omit/disable the select and send `inquiry_type: null`; do not invent production options in the frontend.

The design shows no required marker for Phone Number or Inquiry Type, matching the API. Use client validation for immediate feedback, but always display server field errors from a 422 response.

## 4. Submit a message

```http
POST /api/v2/contact-requests
Accept: application/json
Content-Type: application/json
```

```json
{
  "full_name": "Mariam Al-Khaled",
  "email": "mariam@example.com",
  "phone_number": "+96599998888",
  "inquiry_type": "Corporate & Event Transport",
  "message": "Please help with my enquiry"
}
```

Use `null` for blank optional fields or omit them. If the website has a valid customer access token it may send `Authorization: Bearer <customer-access-token>`; never send an admin token or CMS cookie.

Success is HTTP 201:

```json
{
  "data": {
    "id": 1,
    "created_at": "2026-10-21T06:00:00.000Z"
  }
}
```

Treat this as a receipt only. The API does not provide a public message/status read endpoint and does not promise email delivery. On success, show a confirmation, clear the form, and retain the receipt ID only if useful for support.

## 5. Error and request states

Errors use this envelope:

```ts
type ApiErrorResponse = {
  error: {
    code: string
    message: string
    requestId: string
    fields?: Record<string, string[]>
  }
}
```

| HTTP | Expected handling                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 401  | Only expected when an optional customer token was sent and is invalid; refresh/login or retry once as guest after explicit user action |
| 422  | Map `error.fields` to inputs and show `error.message` as the form summary                                                              |
| 429  | Show a rate-limit message and keep the entered values                                                                                  |
| 500  | Show a generic failure and retain `requestId` for support                                                                              |

Disable the Send Message button while one request is in flight. Do not automatically retry a timed-out POST because the submission may already have been stored. Preserve entered values on every failure.

The separate “Or Chat on WhatsApp” action uses the same computed WhatsApp URL as the card and is hidden when `whatsapp_number` is null.

## 6. Optional Contact Us page content and locale

`GET /api/v2/pages/contact-us?locale=en|ar` uses the shared Page contract documented in [Website frontend API reference](website-api-reference.md). Select the translation whose locale equals `meta.locale`; Arabic can independently fall back to English. Use Page content only for CMS-managed editorial heading/body or SEO. Keep form labels, placeholders, button labels, and generic card labels in frontend localization.

The supplied UI can function without a published `contact-us` Page. A 404 for that read is an editorial content state, not a submission API failure.

## 7. CMS and deployment prerequisites

An administrator configures the contact numbers, descriptions, email, headquarters/map URL, and inquiry options at `/admin/settings`. Submitted messages, including optional phone and inquiry type, appear in `/admin/contact-requests`.

Migrations `1760000000012_add_contact_site_settings.ts` and `1760000000013_add_contact_request_metadata.ts` must be applied in order through the controlled deployment migration process before deploying this frontend contract. They add nullable Site settings and Contact request columns and do not seed or overwrite editorial contact values.

Source-of-truth schemas are in [Customer OpenAPI](customer-openapi.json), referenced by [OpenAPI](openapi.yaml). The backend continues to use:

- `{ data: ... }` success envelopes;
- `{ error: { code, message, requestId, fields? } }` error envelopes;
- `Cache-Control: no-store` on contact submission;
- server-side escaping in the CMS inbox;
- five submissions per IP per hour.
