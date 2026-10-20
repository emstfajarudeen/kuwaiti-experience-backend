# App API reference and contract register

Home planning update (20 October 2026): the next requested section is scoped in the [Home API implementation plan](home-api-implementation-plan.md). Existing hero/featured venue data is reusable, but `/api/v2/home` and the planned Home CMS additions are **not implemented**. The user confirmed Home Explore cards open place details; search stays pending. Cab/rental are excluded, and notifications remain undefined.

Explore implementation update (20 October 2026): the requested place bookmarks, venue phones, highlights/amenities/capabilities, stay check-in/out, theater screen counts, CMS-managed movies/posters/showtimes and Open Now are implemented in v2. See the [Explore integration guide](explore-api.md) and [exact OpenAPI schemas](explore-openapi.json), which supersede the discovery candidates and old media/entity examples below. The [audit and original plan](explore-api-implementation-plan.md) remain design history. The new migration and earlier image migration must be handled before enabling this code against an existing database.

> **First selected screens implemented under `/api/v2`.** Use [customer-api.md](customer-api.md) for the working integration guide and [customer-openapi.json](customer-openapi.json) for exact schemas. This includes phone OTP (delivery adapter pending configuration), customer sessions/registration/deletion, legal-page reads/acceptance snapshots, contact submission and CMS inbox. The broader route map below remains design-stage; v1 is the existing legacy contract.

Edit Profile is implemented too: [profile API reference](customer-profile-api.md). `PATCH /api/v2/customer/me` saves names/email and a verified new phone; `/customer/me/photo` supports private upload/read/removal. Every customer object includes nullable `profile_photo_id`.

Status: **current implementation inventory plus App 2 design-stage route map**. Last audited 20 October 2026 against the [App 2 Figma screen audit](app2-figma-screen-audit.md). The [App 2 section plan](app2-api-implementation-plan.md) is approval-gated. Use `docs/openapi.yaml` and `start/routes.ts` for **live** routes. The current examples in `docs/frontend-api-responses.md` describe existing v1 payloads, which have known key/type inconsistencies listed below. Do not generate a typed client from any proposed route or shape until its implementation section is approved and verified.

The [standalone handoff plan](first-screens-api-handoff-plan.md) records the original design. The implemented `/api/v2` contract and examples are in [customer-api.md](customer-api.md).

## App 2 integration status

| App feature | Present today | Required for the screens |
| --- | --- | --- |
| Home, categories, published place lists/details, static pages, images | Yes, with inconsistent v1 entity keys | Canonical DB-key contract, additional restaurant/stay/theater detail fields and CMS editors |
| Customer OTP auth, guest/session/profile/deletion | v2 OTP/session/registration/profile/photo/verified phone-change/logout/deletion implemented; delivery requires SMS configuration | Persisted language preference remains later work |
| Saved addresses and saved content | No | User-owned address and bookmark APIs |
| Cab | WhatsApp enquiry-link only | Quote, request, dispatch, live trip, payment, cancellation, receipt and rating APIs |
| Car rental | No | Fleet/provider/availability/quote/reservation/payment APIs |
| Booking history and reviews | No | Cab/rent history/detail and eligible review APIs |
| Explore videos | No | Feed, media, likes, comments, save/report and CMS moderation APIs |
| Support form | v2 contact submission, CMS inbox and status updates implemented | Configure contact settings and operational ownership |

### Planned operation map — not implemented

The paths below are **route candidates**, not a released contract. Their version prefix, request fields, response schemas and status codes must be set in Section 1 or the owning approved section, using actual database column names for persisted attributes. Do not call these paths from the app yet.

| Section | Candidate operations | Screen use |
| --- | --- | --- |
| 2 Customer auth | `POST /customer/auth/otp`, `POST /customer/auth/otp/:id/resend`, `POST /customer/auth/otp/:id/verify`, `POST /customer/auth/session`, `POST /customers`, `POST /customer/auth/refresh`, `POST /customer/auth/logout`, `GET/DELETE /customer/me` | First selected screens: phone/OTP, create account, sign out, delete. Profile edit/language preference are later work. |
| 3 Discovery | `GET /home`, `/search`, `/categories`, `/places`, `/places/:slug`, `/theaters/:id/showtimes` if showtime ownership is confirmed | Home and four editorial categories |
| 4 Saved data | `GET/POST /me/addresses`, `PATCH/DELETE /me/addresses/:id`, `GET/POST /me/saved-items`, `DELETE /me/saved-items/:id` | Home/Work addresses and bookmarked places/videos |
| 5 Cab | `POST /cab/quotes`, `POST /cab/rides`, `GET /cab/rides/:id`, `GET /cab/rides/:id/events` or polling, `POST /cab/rides/:id/cancel`, driver-side assignment/start/progress/complete actions | Quote, payment choice, dispatch, tracking, cancellation, completion |
| 6 Rental | `GET /rental/vehicles`, `GET /rental/vehicles/:id`, `POST /rental/quotes`, `POST /rental/reservations`, `GET /rental/reservations/:id`, payment webhook | Search, detail, provider, booking fee, confirmation |
| 7 History/reviews | `GET /me/bookings`, `GET /me/bookings/:id` or type-specific detail, `POST /reviews`, `PATCH /reviews/:id`, `GET /providers/:id/reviews` | Booking tabs/details and ratings |
| 8 Explore | `GET /videos`, `GET /videos/:id/comments`, `POST/DELETE /videos/:id/like`, `POST /videos/:id/comments`, `POST/DELETE /comments/:id/like`, `POST /videos/:id/reports` | Feed, likes, comments, report and save |
| 9 Support/legal | `POST /contact-requests`, `GET /pages/:slug`, `GET /site`; notification and Schedule routes pending product definition | First selected screens: contact and legal. Other controls await product definition. |

Matching admin/CMS APIs are part of each section: discovery editors; customer support; fleet/driver/dispatch; rental provider/rate/availability; booking/payment/cancellation operations; video moderation; support and legal publication. Admin routes require role-based authorization and audit logs. Details are specified when their section is approved.

### Design-stage entity registry

Existing entities and database fields are listed later in this reference. The following entities do **not** exist in the current schema: customer account, saved address, saved item, cab quote/ride/driver/vehicle, rental provider/vehicle/rate/quote/reservation, payment record, video/comment/like/report, review and contact request. Their exact response keys remain **unassigned** until the corresponding migrations and canonical serializers are designed. This protects the database-key rule: a screen label or example value must not become an invented API field name.

## Base behavior currently implemented

- Base path: `/api/v1`.
- JSON successes use `{ "data": ... }`; paginated endpoints add `meta`.
- Errors use `{ "error": { "code": string, "message": string, "requestId": string, "fields"?: unknown } }` and a non-2xx status. The `fields` key is currently conditional. Successful deletes and logout return HTTP 204 with no body.
- Public endpoints need no bearer token. Admin JSON endpoints use `Authorization: Bearer <accessToken>`. Browser CMS paths under `/admin` use signed HttpOnly cookies and CSRF-protected forms.
- Localized public content accepts `locale=en|ar`; missing/other values currently resolve to English, with Arabic-to-English field fallback in the public service.
- Images belong to the record that uses them (place cover/gallery, category type tile, homepage hero, site logo, movie poster); there is no shared media library. Public images are WebP bytes at `/api/v1/images/:key`, served only while owned by visible content; admin previews (`/api/v1/admin/images/:key`, CMS `/admin/images/:key`) are authenticated. Returned image paths are relative to the API origin.

## Screen-to-endpoint map: current behavior

| Flow | Method and path | Query/body | Current response purpose |
| --- | --- | --- | --- |
| Home | `GET /api/v1/home` | `locale` | Hero, discovery title, category type tiles, featured place groups, store links |
| Site chrome | `GET /api/v1/site` | none | Brand, contact, logo, store links |
| Category tabs | `GET /api/v1/categories` | required `type`, optional `locale` | Active categories for type |
| Place list | `GET /api/v1/places` | required `type`; optional `category`, `q`, `page`, `perPage`, `locale` | Published place cards and `meta` |
| Place detail | `GET /api/v1/places/:slug` | optional `locale` | Published place, hours, gallery, price |
| Static page | `GET /api/v1/pages/:slug` | optional `locale` | Published page |
| Cab choices | `GET /api/v1/transport/locations` | optional `locale` | Active pickup/drop-off locations |
| Cab enquiry | `POST /api/v1/transport/enquiry-link` | `pickupId`, `destinationId`, `dateTime` | WhatsApp URL, `confirmed: false`; no booking record |
| Image | `GET /api/v1/images/:key` | none | WebP bytes of an image owned by visible content |
| Health | `GET /api/v1/health` | none | HTTP availability only |

Public places: `category=all` or omitted includes uncategorized places; `page` defaults to 1 and `perPage` to 12, capped at 50. `meta.total` is the filtered total. Only published content with a publication time at or before now appears. The current place search matches English title/summary. Cab date/time is interpreted in `Asia/Kuwait` and must be in the future within one year.

## CMS/admin API: current route inventory

| Area | Routes |
| --- | --- |
| Auth | `POST /admin/auth/login`, `POST /admin/auth/refresh`, `GET /admin/auth/me`, `POST /admin/auth/logout`, `PATCH /admin/auth/password` |
| Dashboard | `GET /admin/dashboard` |
| Places | `GET, POST /admin/places`; `GET, PUT, DELETE /admin/places/:id`; `GET /admin/places/:id/preview`; `POST /admin/places/:id/publish`, `/archive`; `PUT, DELETE /admin/places/:id/cover`; `POST /admin/places/:id/gallery`; `PATCH, DELETE /admin/places/:id/gallery/:imageId` |
| Category types | `GET, POST /admin/category-types`; `PUT, DELETE /admin/category-types/:code`; `PUT, DELETE /admin/category-types/:code/image` |
| Categories | `GET, POST /admin/categories`; `PUT, DELETE /admin/categories/:id` |
| Pages | `GET, POST /admin/pages`; `GET, PUT, DELETE /admin/pages/:id`; `POST /admin/pages/:id/publish`, `/archive` |
| Image preview | `GET /admin/images/:key` |
| Site/home | `GET, PATCH /admin/settings`; `PUT, DELETE /admin/settings/logo`; `GET, PATCH /admin/home`; `PUT, DELETE /admin/home/hero-image?locale=` |
| Transport | `GET, POST /admin/transport/locations`; `PUT, DELETE /admin/transport/locations/:id` |

All paths in this table are relative to `/api/v1`. The browser CMS has parallel HTML routes under `/admin`; its data should use the same canonical entity field names after Section 1. Admin login exists; public user registration/login does not.

## Proposed canonical entity types — implementation pending

These are field-name and presence rules for the first approved contract section. They are **not** examples of today's payloads. All persisted attributes use literal DB column names. A field marked nullable is still a required JSON key with a `null` value when absent.

| Entity | Persisted response fields | Stable type notes |
| --- | --- | --- |
| `User` (admin-safe projection) | `id`, `full_name`, `email`, `role`, `active`, `must_change_password`, `created_at`, `updated_at` | `password` excluded; `updated_at` nullable |
| `CategoryType` | `code`, `name_en`, `name_ar`, `image_url`, `sort_order`, `updated_at` | `name_ar`, `image_url`, `updated_at` nullable; `image_url` derived from internal `image_key` |
| `Category` | `id`, `type`, `slug`, `sort_order`, `active`, `created_at`, `updated_at` | `updated_at` nullable; categories have no image; localized names from `category_translations` |
| `Place` | `id`, `type`, `category_id`, `slug`, `status`, `cover_url`, `latitude`, `longitude`, `price_amount`, `price_currency`, `price_mode`, `website_url`, `featured_order`, `published_at`, `created_at`, `updated_at` | Nullable IDs/coordinates/amount/URL/order/dates always present; `price_amount` a three-decimal string |
| `PlaceTranslation` | `id`, `place_id`, `locale`, `title`, `summary`, `body`, `address`, `hours_note`, `price_unit`, `seo_title`, `seo_description` | Nullable editorial fields always present |
| `PlaceHour` | `id`, `place_id`, `weekday`, `interval_index`, `opens_at`, `closes_at`, `closes_next_day`, `closed` | Boolean keys always booleans; times nullable |
| `PlaceImage` | `id`, `place_id`, `url`, `alt_en`, `alt_ar`, `caption_en`, `caption_ar`, `sort_order`, `created_at` | `alt_ar` and captions nullable; `url` derived from internal `storage_key` |
| `Page` | `id`, `slug`, `status`, `published_at`, `created_at`, `updated_at` | Publication/update dates nullable; localized content from `page_translations` |
| `PageTranslation` | `id`, `page_id`, `locale`, `title`, `body`, `seo_title`, `seo_description` | SEO fields nullable |
| `SiteSettings` | `id`, `brand_name`, `whatsapp_number`, `contact_email`, `app_store_url`, `play_store_url`, `logo_image_url`, `updated_at` | Nullable keys always present; public disclosure of `whatsapp_number` needs explicit product decision |
| `HomeContent` | `locale`, `hero_eyebrow`, `hero_title`, `discovery_title`, `app_title`, `app_body`, `hero_image_url`, `updated_at` | App/image/update fields nullable |
| `TransportLocation` | `id`, `code`, `pickup_enabled`, `dropoff_enabled`, `active`, `sort_order`, `latitude`, `longitude` | Coordinates nullable; flags are booleans; localized name from `transport_location_translations` |

Relationship containers and computed actions need final naming in Section 1. The default is to use table names for relation containers (`place_translations`, `place_hours`, `place_images`) and to expose image URLs instead of internal storage keys. A selected localized translation may be included as a full translation row, using the same keys as any other translation row. This avoids aliases such as `hoursNote`, `cover`, `category`, and `seo` inside a `Place` object.

## Current v1 incompatibilities

| Route/object | Current keys or types | Contract change needed |
| --- | --- | --- |
| `/admin/auth/me` user | `id`, `name`, `email` | `full_name` and one complete admin-safe `User` shape |
| Public place card vs detail vs admin place | Card omits most DB fields; detail adds nested `price`, `coordinates`, `seo`, `cabDestination`; admin show returns DB row and relations | One canonical `Place` wherever a place is returned |
| Public category type | `type`, `name`, `image`, `order` | `code`, `name_en`/`name_ar`, `image_url`, `sort_order` |
| Public site/home | camelCase keys and presentation groups | exact `site_settings`/`home_content` columns for entity values |
| Public location | camelCase flags | `pickup_enabled`, `dropoff_enabled`; fixed boolean types |
| Public hours | `closes_next_day` and `closed` may be booleans or 0/1 | fixed booleans everywhere |
| Admin settings/home and CRUD writes | Defaults/updates/receipts have differing field sets | shared resource serializer or separately typed operation receipt |
| Errors | `fields` present only for some errors | Decide and document `fields` as consistently optional or always `null` |

## Reference maintenance checklist for each approved section

Update the screen map, route table, canonical schemas, exact request/response examples, nullability, status/error matrix, version migration notes and OpenAPI in the same change as code. Verify examples against actual HTTP responses and check all repeated entity appearances for identical key sets and JSON types. Record the section approval and verification results in the section's implementation note.
