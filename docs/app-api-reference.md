# Mobile app API reference

Last checked against routes, controllers, validators and serializers: **9 November 2026**. This is the starting document for app developers and AI implementing the mobile client.

## 1. Start here

**API origin:** `http://localhost:3333` for local development. Configure the deployed origin in the app environment; no production URL is defined here. On a physical phone, localhost refers to the phone: use a reachable backend address supplied by your backend developer.

**App API base:** `<API_ORIGIN>/api/v2`. Endpoint paths below include `/api/v2` explicitly. Keep the origin separate so image paths can also resolve correctly.

| Read/import                                                                                                                     | Purpose                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| This document                                                                                                                   | Supported screens, exact endpoint map, integration order and common examples                   |
| [Customer OpenAPI](customer-openapi.json)                                                                                       | Exact account/profile/support request and response schemas, including required/nullable fields |
| [Car rental OpenAPI](rental-openapi.json) | Car search, quotes, bookings, cancel and booking-fee payment schemas |
| [Saved-address OpenAPI](saved-addresses-openapi.json)                                                                     | Exact customer address create/list/detail/update/delete schemas |
| [Notifications OpenAPI](notifications-openapi.json)                                                                      | Customer FCM token and notification inbox contracts             |
| [App configuration OpenAPI](app-config-openapi.json) | Public startup configuration and platform update settings |
| [Explore OpenAPI](explore-openapi.json)                                                                                         | Exact place/category/bookmark/movie/showtime schemas and parameters                            |
| [Home OpenAPI](home-openapi.json)                                                                                               | Exact Home, Home CMS, card-selection and featured-order schemas                                |
| [Postman collection](postman/kuwaitiexperience.postman_collection.json) + [environment](postman/local.postman_environment.json) | Importable requests; [setup and execution order](postman/README.md)                            |
| [Customer guide](customer-api.md), [profile guide](customer-profile-api.md), [Explore guide](explore-api.md)                    | More detail about the corresponding implemented flows and CMS management                       |

The standalone JSON files are OpenAPI 3.1 specifications. Their paths include mobile and, where applicable, admin operations: mobile clients use the non-admin paths listed here. Use `components.schemas` and each operation's request/response schema to define typed models. Home reuses the Explore Place/CategoryType schemas. The root [openapi.yaml](openapi.yaml) additionally includes legacy website APIs and references these files.

**Implemented means the route and backend behavior exist.** It does not mean all provider credentials and editorial content are configured. SMS delivery is pending configuration: OTP request/resend returns **503** unless a development or staging server explicitly enables `CUSTOMER_OTP_DEV_RESPONSE=true` with an OTP secret. In that mode, use fixed OTP `2580`; the code is not returned in the response. This opt-in also works with `NODE_ENV=production`, so disable it before serving real customers. Approved legal pages and venue images/copy must be supplied through the CMS.

FCM inbox/token APIs are implemented. Actual push delivery requires the FCM service-account environment values and a running `node ace notifications:deliver-push --watch` worker. The rental booking-confirmed notification (`rental_booking_confirmed`) is created when a booking fee is verified, and `rental_driver_assigned` when the provider assigns a driver to a with-driver booking (the booking's `driver` field then holds the driver). Ride event sources are not connected yet.

At startup, call `GET /api/v2/config` without authentication. Set `Accept-Language` to `en` or `ar`; missing Arabic text falls back to English. `api_base_url` and `image_base_url` are origins: API paths already include `/api/v2`, and relative image paths already include `/api/v1/images`. The app compares its installed numeric `major.minor.patch` version with the relevant platform's configured `version`; a null version means no update is configured. When an older version is detected, `force` determines whether the update is mandatory. A forced update requires a store URL. `maintenance.enabled` instructs the app to show the maintenance screen; it does not block other API calls. Keep a last successful response for offline startup and provide a retry state for first launch without one.

The CMS **Site settings → Mobile app configuration** page manages versions, store links, localized messages and maintenance separately in each environment. Server operators must set `APP_CONFIG_ENVIRONMENT` to `qa` or `live` to isolate settings, including when deployments share a database. Without it, the response environment is null and settings use a shared `default` entry. Set `APP_API_BASE_URL` and `APP_IMAGE_BASE_URL` to public origins; unset URLs use the configured `APP_URL` origin. These origins must be reachable by the phone. A build must contain its initial QA or live configuration endpoint to bootstrap this call. Deploy the new migration before using the endpoint.

## 2. What the app can integrate now

| Screen/feature                                                                       | Status                                                              | Integration                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Phone login, OTP, resend, registration                                               | Implemented; real delivery awaits SMS configuration                 | Follow section 5; verification proof decides sign-in vs create-account |
| Continue as guest                                                                    | Available                                                           | No guest-login call/token; browse public APIs                          |
| Edit Profile, photo, verified phone change                                           | Implemented; phone OTP uses the same delivery or development option | Section 6                                                              |
| Explore hub and category filters                                                     | Implemented                                                         | Section 7                                                              |
| Attractions, Dine In, Stay, Theaters list/detail                                     | Implemented                                                         | Shared Place model on every endpoint                                   |
| Venue phone, highlights/amenities, stay check-in/out, theater screen count | Implemented; values depend on CMS content                           | Section 8                                                              |
| Movies and upcoming showtimes                                                        | Implemented; CMS maintained                                         | Section 9                                                              |
| Save/unsave venues and saved venue list                                              | Implemented; customer authentication required                       | Section 10                                                             |
| Contact Us, WhatsApp, privacy/terms, logout, delete account                          | Implemented; legal/settings content prerequisites apply             | Sections 5, 6 and 11                                                   |
| App Home hero, Explore cards and four featured carousels                             | Implemented; artwork and card choices depend on CMS                 | Section 12; `GET /api/v2/home`                                         |
| Notifications inbox and FCM token APIs                                              | Implemented; actual delivery requires Firebase credentials and the worker | [Notifications API](notifications-openapi.json); ride event triggers are pending |
| Home search and Schedule                                                           | Pending                                                                  | No API contract to integrate                                           |
| Saved addresses (Home, Work and custom locations)                                  | Implemented; customer authentication required                             | [Saved-address API reference](saved-addresses-api.md)                  |
| Car rental search, detail, quote, reservation, MyFatoorah booking fee, rental history, reviews and ratings | Implemented; needs CMS fleet data and MyFatoorah credentials             | [Rental OpenAPI](rental-openapi.json) and [Rental API guide](rental-api.md) |
| Cab, unified cab/rental history, cab reviews                                        | Pending separate sections                                                 | No working mobile feature contract is supplied here                    |

The website's `/api/v1/home` retains its legacy response. The app's Home Explore cards link to existing place details. A future cab flow can receive a selected place, but no cab quotation/ride-creation API is implemented in this section.

## 3. Request and response rules

### Authentication

| Label in the endpoint tables | What to send                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Public                       | No Authorization header required                                                                         |
| Guest/customer               | Omit Authorization for guests; send a customer bearer token for personalized data or account association |
| Customer                     | `Authorization: Bearer <access_token>` required                                                          |


Customer tokens are opaque strings, not admin JWTs. A verification proof is also not an access token. Store access/refresh tokens in mobile OS secure storage. Do not send admin credentials or CMS cookies to customer APIs. A supplied invalid/expired token on a guest/customer endpoint is rejected; it does not downgrade to guest browsing.

For JSON requests send `Accept: application/json` and `Content-Type: application/json`. For uploads let the HTTP library set the multipart boundary. HTTP 204 has no body: do not try to decode it as JSON. Private photo reads return binary WebP.

### Models and nullability

Persisted entity keys retain DB spelling: `phone_e164`, `first_name`, `cover_image_key`, `price_amount`, `check_in_time`, etc. UI labels can differ. Reuse a single Customer model and a single Place model everywhere those entities appear; list/detail/saved responses do not define smaller versions of the entity.

A **nullable** property is still a required JSON key when marked required in OpenAPI. For example, use `email: string | null`, not `email?: string`. Empty relations are `[]`. Optional request fields differ: omitted profile PATCH fields retain their current values; supported explicit null clears a field. The schemas describe each operation's actual rules.

| Value                                | JSON representation                                                         |
| ------------------------------------ | --------------------------------------------------------------------------- |
| IDs/counts                           | Integer                                                                     |
| Flags                                | Boolean, never numeric 0/1                                                  |
| Missing scalar                       | `null` where the schema permits it                                          |
| Money                                | Three-decimal string such as `"95.000"`, or null; retain currency/mode/unit |
| Coordinates                          | Number or null                                                              |
| Timestamps                           | ISO UTC string, e.g. `2026-10-20T07:00:00.000Z`, or null where allowed      |
| Check-in/out and opening clock times | Local clock strings such as `15:00:00`, in `Asia/Kuwait`                    |
| OTP                                  | Four-digit string, e.g. `"0123"`; preserve leading zeros                    |

`data`, `meta`, `included`, credentials and verification receipts are protocol containers, not database entities. Their shapes are defined per operation. SiteSettings returns the database field `logo_image_key`; resolve its URL from `meta.images`, as with discovery images. Do not rename stored image keys to URL fields in an entity model.

### Localization

Public app reads use the `Accept-Language` request header (`en` or `ar`; English by default). Send the app's selected language on every request, for example `Accept-Language: ar`. This applies to Home, Explore, categories, features, place lists/details, saved places, showtime movies, and pages. Translation arrays retain their names but contain one selected row. Paired fields such as `name_en`/`name_ar` return as `name`; `caption_en`/`caption_ar` return as `caption`. Missing, null, empty, or whitespace-only Arabic values fall back to English **per field**. Response envelopes and unrelated fields retain their names. Admin/CMS reads retain stored language fields and rows. The v1 app reads also accept this header; their existing `?locale=` query remains a fallback when no header is sent.

Legal-page reads use `Accept-Language: en|ar` (default English), with the existing `?locale=` query accepted when the header is absent. Use `meta.locale` to identify the selected translation row; it may be English after fallback. The selected `PageTranslation` includes nullable `eyebrow` and required `body_format` (`plain_text` or `html`): escape plain text, or render server-sanitized HTML in a constrained content container. Never interpolate HTML into attributes or scripts.

## 4. Quick start: browse without login

```bash
curl --request GET 'http://localhost:3333/api/v2/home' --header 'Accept: application/json'
curl --request GET 'http://localhost:3333/api/v2/explore' --header 'Accept: application/json'
curl --request GET 'http://localhost:3333/api/v2/places?type=attraction&page=1&per_page=12' --header 'Accept: application/json'
```

Read `data.category_types` for the Explore hub. Choose a type's `code`, fetch its categories/features, then fetch `/places?type=<code>`. Use a place's **slug** for detail/showtimes; use its numeric **id** for bookmark writes. Never substitute a category ID or transport-location ID for a Place ID.

An empty list is a valid result. Do not hardcode sample IDs, assume a featured venue always exists, or fill missing images/prices with invented values.

## 5. Login and registration

All endpoints in this table allow guest access. Omit Authorization during initial login and refresh so an expired token is not accidentally submitted.

| Method and path                              | Request body                             | Success                         |
| -------------------------------------------- | ---------------------------------------- | ------------------------------- |
| `POST /api/v2/customer/auth/otp`             | `{ "phone_e164": "+96590987788" }`       | 202, `data: OtpReceipt`         |
| `POST /api/v2/customer/auth/otp/{id}/resend` | No body                                  | 202, `data: OtpReceipt`         |
| `POST /api/v2/customer/auth/otp/{id}/verify` | `{ "code": "0123" }`                     | 200, `data: Verification`       |
| `POST /api/v2/customer/auth/session`         | `{ "verification_token": "<proof>" }`    | 200, `data: CustomerAuthResult` |
| `POST /api/v2/customers`                     | Registration body below                  | 201, `data: CustomerAuthResult` |
| `POST /api/v2/customer/auth/refresh`         | `{ "refresh_token": "<refresh token>" }` | 200, `data: CustomerAuthResult` |

`{id}` in OTP paths is the challenge UUID returned by request/resend. Example successful OTP receipt (available when delivery or the development fixed-code option is configured):

```json
{
  "data": {
    "id": "123e4567-e89b-42d3-a456-426614174000",
    "expires_at": "2026-10-20T07:05:00.000Z",
    "resend_available_at": "2026-10-20T07:01:00.000Z"
  }
}
```

With `CUSTOMER_OTP_DEV_RESPONSE=true`, request a challenge and verify it with `"code": "2580"`. The receipt never includes the code. This temporary mode allows 10 OTP requests per phone per minute without a resend cooldown. Expiry, guess limits, and one-use proof still apply.

After verify, inspect `data.next_action`: `sign_in` means call `/customer/auth/session`; `create_account` means show the account form and call `/customers`. The `verification_token` is one use, expires in 600 seconds, and is not a logged-in session. `update_phone` belongs only to the authenticated phone-change flow.

Registration requires only the verified proof and profile fields. The app handles legal acceptance separately; no policy hash is sent to this endpoint:

```json
{
  "verification_token": "<proof from verify>",
  "first_name": "Mariam",
  "last_name": "Al-Khaled",
  "email": null
}
```

Names are trimmed, 1–120 characters. Email is optional/nullable, valid email format, maximum 254 characters. Phone must be international E.164 format.

Sign-in, registration and refresh return this same shape (values below are illustrative):

```json
{
  "data": {
    "customer": {
      "id": 1,
      "phone_e164": "+96590987788",
      "first_name": "Mariam",
      "last_name": "Al-Khaled",
      "email": null,
      "profile_photo_id": null,
      "phone_verified_at": "2026-10-20T07:00:00.000Z",
      "created_at": "2026-10-20T07:00:00.000Z",
      "updated_at": null
    },
    "credentials": {
      "access_token": "<opaque access token>",
      "refresh_token": "<opaque refresh token>",
      "expires_in": 900
    }
  }
}
```

Access lasts 15 minutes; sessions have a 7-day absolute lifetime. Refresh rotates both credentials and invalidates the old access token. Serialize refresh requests in the client so concurrent 401 responses share one refresh attempt. Store the new pair together; never reuse an old refresh token, since reuse revokes the session. On refresh failure, clear the session and show login. Do not blindly retry state-changing requests after an ambiguous network failure.

OTP expires after 5 minutes. Normal SMS mode has a 60-second resend cooldown and 5 sends per phone/hour. The temporary fixed-code mode allows 10 requests per phone/minute with no resend cooldown. Use server `resend_available_at`, not a hardcoded countdown start. Both modes allow 5 guesses per challenge, plus 30 auth requests/minute for each IP-plus-phone/challenge/token combination with a 5-minute block when exceeded. Different users behind one IP have separate limits. Display a retry state on 429. Without SMS or the explicit fixed-code option, show the 503 unavailable state. Fixed OTP `2580` works whenever the temporary flag is enabled outside tests.

## 6. Profile and account controls

All operations below require Customer authentication.

| Method and path                                  | Request                                         | Success                                                 |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| `GET /api/v2/customer/me`                        | None                                            | 200, `data: Customer`                                   |
| `PATCH /api/v2/customer/me`                      | Any supported names/email/verified-phone fields | 200, `data: Customer`                                   |
| `POST /api/v2/customer/me/photo`                 | Multipart `file`                                | 200, `data: Customer`                                   |
| `GET /api/v2/customer/me/photo`                  | None                                            | 200, private `image/webp`; 404 when absent              |
| `DELETE /api/v2/customer/me/photo`               | None                                            | **200**, `data: Customer` with `profile_photo_id: null` |
| `POST /api/v2/customer/me/phone/otp`             | `{ "phone_e164": "+96590987222" }`              | 202, `data: OtpReceipt`                                 |
| `POST /api/v2/customer/me/phone/otp/{id}/resend` | None                                            | 202, `data: OtpReceipt`                                 |
| `POST /api/v2/customer/me/phone/otp/{id}/verify` | `{ "code": "0123" }`                            | 200, `data: Verification`, `next_action: update_phone`  |
| `POST /api/v2/customer/auth/logout`              | None                                            | 204, empty body                                         |
| `DELETE /api/v2/customer/me`                     | None                                            | 204, empty body                                         |

Profile save example: `{ "first_name": "Zia", "last_name": "Ali", "email": null }`. Omitted fields remain unchanged; `email: null` clears email. An empty PATCH returns 422 `EMPTY_UPDATE`. Compose display name/initials in the app from the same Customer fields used after login.

Phone change: request/verify the new phone using this table's authenticated endpoints, then PATCH `{ "phone_e164": "<verified number>", "phone_verification_token": "<proof>" }` in the **same customer session**. A normal login proof cannot change the phone. Successful phone change keeps the initiating session and revokes other sessions. See the [complete phone-change flow](customer-profile-api.md#phone-changes).

Phone-change request/resend and account deletion require OTP sign-in within the preceding 10 minutes. On 403 `REAUTHENTICATION_REQUIRED`, repeat normal sign-in and restart the protected action. These verification steps need SMS delivery or the explicit development fixed-code option.

Photo uploads accept JPEG/JPG/PNG/WebP, maximum 5 MB and 20 megapixels; uploads are limited to 20/customer/hour. Fetch private photo bytes with the bearer header; a public image widget URL without authentication will not work. Render initials when `profile_photo_id` is null. Photo upload/removal saves immediately, independently of the text Save button.

Logout revokes the current session. Account deletion permanently removes the customer and currently owned account data, including bookmarks; clear local credentials afterward. The app must obtain the user's delete confirmation before calling the delete endpoint.

## 7. Explore hub, filters and place browsing

These are Guest/customer operations. A customer token adds their bookmark state to list/detail responses.

| Method and path              | Inputs                                             | Success                                                                         |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/v2/explore`        | `Accept-Language` header                           | 200, localized `data.category_types[].name`, `meta.images`                     |
| `GET /api/v2/categories`     | Required `type`; `Accept-Language` header           | 200, localized `data: Category[]`                                               |
| `GET /api/v2/place-features` | Required `type`; `Accept-Language` header           | 200, localized `data: Feature[]`                                               |
| `GET /api/v2/places`         | Required `type`; optional filters/pagination; `Accept-Language` header | 200, localized `PlaceList`                                         |
| `GET /api/v2/places/{slug}`  | Place slug; `Accept-Language` header                | 200, localized `PlaceResult` plus viewer/image metadata                        |

| UI section  | Actual `type` code |
| ----------- | ------------------ |
| Attractions | `attraction`       |
| Dine In     | `restaurant`       |
| Stay        | `hotel_resort`     |
| Theaters    | `theater`          |

Types are CMS-managed and may include additional codes. Read the hub rather than treating these four examples as a closed enum. CategoryType uses `code`, not `type`, for its own identifier. Selecting it supplies that code as the place query's `type` value.

| Place-list query | Meaning/default                                                               |
| ---------------- | ----------------------------------------------------------------------------- |
| `type`           | Required valid type code                                                      |
| `category`       | Category **slug**; omitted or `all` means all, including uncategorized places |
| `feature`        | Feature **code**, e.g. `family-friendly`                                      |
| `q`              | Within-type English/Arabic title/summary search; max 80 characters            |
| `page`           | Default 1, range 1–10000                                                      |
| `per_page`       | Default 12, range 1–50                                                        |

Filters combine with AND. Use server `meta.total`/`last_page` for pagination; reset to page 1 when filters change. Unknown category/feature codes produce an empty list; invalid type/pagination/filter syntax returns 422. Existing within-type `q` works; the **Home cross-type search flow remains pending**.

Public results exclude drafts, archives and future publications. Category and feature labels come from their own resources; feature `kind` is `highlight`, `amenity` or `capability`.

## 8. Place response and screen mapping

This complete illustrative English list response shows all required Place keys. IDs/content/images are examples, not guaranteed seeded records. A detail endpoint returns the same localized Place object directly under `data`, without list pagination keys.

```json
{
  "data": [
    {
      "id": 1,
      "type": "attraction",
      "category_id": 1,
      "slug": "kuwait-towers",
      "status": "published",
      "cover_image_key": null,
      "latitude": null,
      "longitude": null,
      "price_amount": "3.000",
      "price_currency": "KWD",
      "price_mode": "fixed",
      "website_url": null,
      "featured_order": 0,
      "phone_e164": null,
      "check_in_time": null,
      "check_out_time": null,
      "screen_count": null,
      "published_at": "2026-10-20T07:00:00.000Z",
      "created_at": "2026-10-20T07:00:00.000Z",
      "updated_at": null,
      "place_translations": [
        {
          "id": 1,
          "place_id": 1,
          "locale": "en",
          "title": "Kuwait Towers",
          "summary": "Example summary",
          "address": "Example address, Kuwait City",
          "body": "Example venue description",
          "hours_note": null,
          "price_unit": "person",
          "seo_title": null,
          "seo_description": null
        }
      ],
      "place_images": [],
      "place_features": []
    }
  ],
  "meta": {
    "viewer": [{ "place_id": 1, "saved": false }],
    "images": [],
    "evaluated_at": "2026-10-20T07:00:00.000Z",
    "page": 1,
    "per_page": 12,
    "total": 1,
    "last_page": 1
  }
}
```

| Screen value/action                        | Where to read it / behavior                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Venue name, subtitle, address, description | Localized `place_translations.title`, `summary`, `address`, `body`                                           |
| Cover                                      | `cover_image_key` matched to `meta.images[].storage_key`; resolve its `url` against API origin               |
| Gallery                                    | Ordered `place_images`; match each `storage_key` to the same image metadata                                  |
| Bookmark icon                              | Match `meta.viewer[].place_id` to `place.id`, then read `saved`                                              |
| Phone Call                                 | Native `tel:` action using `phone_e164`; hide/disable when null                                              |
| Price                                      | `price_mode` (`unknown`, `free`, `from`, `fixed`), `price_amount`, `price_currency`, translated `price_unit` |
| Opening-hours note                         | Translated `hours_note` (free text)                                                |
| Stay check-in/out                          | Nullable `check_in_time`/`check_out_time`, for `hotel_resort`                                                |
| Highlights/amenities                       | Localized `place_features` labels, grouped by `kind`                                                         |
| Theater screens                            | Nullable `screen_count`; movie sessions use section 9                                                        |
| Cab destination                            | Future app flow can use place identity/coordinates; ride creation is not available                           |

Derived viewer/image metadata is outside Place. Do not add `is_saved`, `cover`, `hoursNote` or nested `price.amount` aliases to the wire model. Presentation/view models can format these values locally.


For public editorial images use returned URLs such as `/api/v1/images/<key>.webp`. The v1 prefix here is intentional image delivery, not a legacy Place contract. Render a placeholder on null/missing/unavailable images. Customer photos use the separate authenticated endpoint in section 6.

## 9. Theater movies and showtimes

| Method and path                       | Auth/query                                                                   | Success             |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| `GET /api/v2/places/{slug}/showtimes` | Guest/customer; theater slug; optional `date=YYYY-MM-DD`, `page`, `per_page` | 200, `ShowtimeList` |

Date means a Kuwait calendar day; omission defaults to today in Kuwait. Pagination defaults to page 1, 12 items, maximum 50. Only published upcoming sessions on that date, for a published theater and published movie, are returned. Past/cancelled sessions are excluded; a valid empty date returns an empty list. A non-theater slug returns 404.

```json
{
  "data": [
    {
      "id": 1,
      "place_id": 21,
      "movie_id": 3,
      "starts_at": "2026-10-21T16:00:00.000Z",
      "format": "IMAX",
      "status": "published",
      "created_at": "2026-10-20T07:00:00.000Z",
      "updated_at": null
    }
  ],
  "included": {
    "movies": [
      {
        "id": 3,
        "title": "Example movie",
        "synopsis": null,
        "duration_minutes": 120,
        "age_rating": null,
        "poster_image_key": "123e4567-e89b-42d3-a456-426614174001.webp",
        "status": "published",
        "published_at": "2026-10-20T07:00:00.000Z",
        "created_at": "2026-10-20T07:00:00.000Z",
        "updated_at": null
      }
    ]
  },
  "meta": {
    "images": [
      {
        "storage_key": "123e4567-e89b-42d3-a456-426614174001.webp",
        "url": "/api/v1/images/123e4567-e89b-42d3-a456-426614174001.webp"
      }
    ],
    "date": "2026-10-21",
    "timezone": "Asia/Kuwait",
    "page": 1,
    "per_page": 12,
    "total": 1,
    "last_page": 1
  }
}
```

Join `data[].movie_id` to `included.movies[].id`, group sessions by movie and render each `starts_at` in Kuwait time. Movie IDs can recur on later pages: merge/deduplicate movies and append unique showtimes by their IDs. The full date's schedule can require more pages. Resolve `poster_image_key` through `meta.images`, using the same image approach as places. Movie/showtime editing is a CMS responsibility. There is no ticket reservation/purchase API.

## 10. Saved places

All require Customer authentication. `{id}` is the numeric Place ID. The server identifies the customer from the bearer token; do not submit a customer ID.

| Method and path                                | Request/query                                                     | Success                                               |
| ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `GET /api/v2/customer/me/saved-places`         | Optional `type`, `category`, `feature`, `q`, `page`, `per_page`; `category` is a slug from `/api/v2/categories?type={type}`; omit it or use `all` for every category | 200, `data.category_types`, `data.places`, and viewer/pagination metadata |
| `PUT /api/v2/customer/me/saved-places/{id}`    | No body                                                           | 200, `data: SavedPlace`                               |
| `DELETE /api/v2/customer/me/saved-places/{id}` | No body                                                           | 204, empty body                                       |

Save example: `{ "data": { "customer_id": 1, "place_id": 12, "created_at": "2026-10-20T07:00:00.000Z" } }`. Save/delete are idempotent. After success synchronize bookmark state for that ID across existing screens; on failure retain/restore the previous state. Guest save controls should open login. Saved reads hide unpublished/deleted content and use the same visibility rules for totals. Save writes are limited to 120/customer/minute. Personal addresses use the separate [saved-address CRUD API](saved-addresses-api.md); saved videos remain pending.

## 11. Legal, contact and settings

| Method and path                 | Auth/request                                                                                    | Success                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/v2/pages/{slug}`      | Public; `about-us`, `contact-us`, `privacy-policy` or `terms-and-conditions`; `Accept-Language` header | 200, `data: Page` with one selected `page_translations` row; `meta: { locale, content_hash }` |
| `GET /api/v2/site`              | Public                                                                                          | 200, `data: SiteSettings`; `meta.images` for logo URL                        |
| `POST /api/v2/contact-requests` | Guest/customer; JSON below                                                                      | 201, submission receipt                                                      |

```json
{
  "full_name": "Mariam Al-Khaled",
  "email": "mariam@example.com",
  "phone_number": "+96599998888",
  "inquiry_type": "Corporate & Event Transport",
  "message": "Please help with my enquiry"
}
```

Required contact fields are trimmed `full_name` (1–120 characters), valid `email` (up to 254), and trimmed `message` (1–300). `phone_number` is optional/null and, when present, uses 8–15 digits with an optional leading `+`; `inquiry_type` is optional/null and 1–120 characters. Success is `{ "data": { "id": 1, "created_at": "2026-10-20T07:00:00.000Z" } }`. This is a **receipt**, not a full ContactRequest model. There is no customer/public contact inbox API. Limit: 5 submissions/IP/hour. Avoid automatic retries after a timeout because a successful submission may already have been recorded.

SiteSettings keys: `id`, `brand_name`, nullable `direct_phone_number`, `direct_phone_description`, `whatsapp_number`, `whatsapp_description`, `contact_email`, `headquarters_name`, `headquarters_address`, `headquarters_map_url`, array `contact_inquiry_types`, nullable `app_store_url`, `play_store_url`, `logo_image_key`, and nullable `updated_at`. Resolve `logo_image_key` through `meta.images`. Build `tel:`, `mailto:`, and `https://wa.me/<digits-only number>` client links; use `headquarters_map_url` directly. Hide unavailable cards when their destination is null. Page requests return 404 for missing/unpublished content; the two legal slugs return 503 for recognized placeholder legal copy. See [Contact Us frontend reference](contact-us-frontend-reference.md) for the supplied web UI mapping.

## 12. Home screen

`GET /api/v2/home` reads `Accept-Language` (`en` or `ar`; English by default) and accepts a guest request or an optional **customer** bearer token. An invalid supplied token returns 401. The response uses `Cache-Control: no-store` because `meta.viewer.saved` can be personal. The public response localizes paired fields and selected translation rows.

| Response path             | Type and use                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data.home_content`       | Up to one selected hero-copy row with `hero_image_key`; missing Arabic fields use English. The array can be empty. |
| `data.category_types`     | Configured type descriptors in CMS order, with localized `name`. |
| `data.home_explore_cards` | Up to eight active cards with localized `caption`. Each `place_id` points into `data.places`. |
| `data.places`             | Places for selected cards and featured sections, with one selected translation row and localized paired fields. |
| `meta.home_sections`      | Ordered `{ type, place_ids, has_more }[]` for the four configured venue types. Each `place_ids` list has at most eight IDs. Empty sections have `[]`.                           |
| `meta.viewer`             | `{ place_id, saved }[]` keyed by place ID. `saved` is false for guests.                                        |
| `meta.images`             | `{ storage_key, url }[]`. Resolve `hero_image_key`, `image_key`, `cover_image_key`, and gallery `storage_key` here. Null/missing keys have no URL.                              |
| `meta.evaluated_at`       | UTC ISO timestamp used for publication evaluation.                                                                                                                 |

Other table-backed entity properties use their database column names. Protocol containers and computed metadata are named separately.

Example response skeleton (illustrative content):

```json
{
  "data": {
    "home_content": [
      {
        "locale": "en",
        "hero_eyebrow": "WELCOME TO KUWAIT",
        "hero_title": "Explore Kuwait",
        "hero_image_key": null,
        "discovery_eyebrow": "EVERYTHING IN ONE PLACE",
        "discovery_title": "What would you like to do?",
        "discovery_description": "Start with a ride, then make the city yours. Find the best of Kuwait by category.",
        "app_title": null,
        "app_body": null,
        "updated_at": "2026-10-21T06:00:00.000Z"
      }
    ],
    "category_types": [],
    "home_explore_cards": [],
    "places": []
  },
  "meta": {
    "home_sections": [],
    "viewer": [],
    "images": [],
    "evaluated_at": "2026-10-21T06:00:00.000Z"
  }
}
```

The skeleton shows valid empty arrays, not promised production content. When the four category types exist, `home_sections` contains one entry per type even if it has no featured venues. Editors must supply approved hero art, venue covers and card selections; the API does not insert screenshot samples.

### Render and navigate

1. Use `home_content` for hero text/art. The wide **Explore Kuwait** tile and its heading arrow open the existing `/api/v2/explore` hub.
2. For each `home_explore_cards` row, find the matching `Place` by `place_id`. Use `caption` if present; otherwise use the selected `place_translations[0].title`. Render the place's cover from `meta.images`. Tap opens `/api/v2/places/{slug}`.
3. For a carousel, walk its `place_ids` in order and look up the full `Place` in `data.places`. Use `meta.viewer` for bookmark state. The section arrow opens `/api/v2/places?type=<type>`; `restaurant` is the stored code for the Dine In label, and `hotel_resort` for Stay.
4. Missing copy or image is an empty/null content state. Saved state is customer-specific.

`has_more` says additional **featured** rows existed past the eight-card Home cap; the category listing is independently paginated and may also contain non-featured places. The website's `/api/v1/home` retains its legacy response and is not the mobile Home contract.

### Home CMS and admin operations

The browser editor is `/admin/home`; it can edit localized Home copy/hero, select existing places for the Explore strip, set localized captions, reorder/activate cards, and link to the place editor for featured rank. Category type names, images and order remain in `/admin/category-types`. Browser forms use admin sessions and CSRF. The matching JSON API uses **admin JWT**, never a customer token.

| Method and path                                           | Input                                                                                                | Success                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/v2/admin/home?locale=en`                        | Locale `en` or `ar`; defaults to `en`                                                                | `data` is HomeContent or null; `meta.images`                         |
| `PATCH /api/v2/admin/home`                                | `locale`, `hero_eyebrow`, `hero_title`, `discovery_eyebrow`, `discovery_title`, `discovery_description`; optional nullable `app_title`, `app_body` | Complete `HomeContent` in `data`                                     |
| `PUT /api/v2/admin/home/hero-image?locale=en`             | Multipart `file`: JPEG/PNG/WebP up to 5 MB                                                           | Complete `HomeContent` in `data`                                     |
| `DELETE /api/v2/admin/home/hero-image?locale=en`          | No body                                                                                              | 204                                                                  |
| `GET /api/v2/admin/home-explore-cards?page=1&per_page=20` | Pagination, max 50 per page                                                                          | Complete `HomeExploreCard[]`, `included.places`, pagination metadata |
| `GET /api/v2/admin/home-explore-cards/{id}`               | Card ID                                                                                              | Complete card and canonical related Place                            |
| `POST /api/v2/admin/home-explore-cards`                   | `place_id`, `sort_order`, `active`; optional nullable `caption_en`, `caption_ar`                     | 201, complete card and related Place                                 |
| `PUT /api/v2/admin/home-explore-cards/{id}`               | Same full input as POST                                                                              | Complete card and related Place                                      |
| `DELETE /api/v2/admin/home-explore-cards/{id}`            | Card ID                                                                                              | 204; venue retained                                                  |
| `PATCH /api/v2/admin/places/{id}/featured`                | `{ "featured_order": 0 }` or `{ "featured_order": null }`                                            | Complete canonical `Place` response                                  |

Use the existing `GET /api/v2/admin/places` picker. A card can refer to a draft for editorial preparation, but public Home shows it only when active and published. One venue can have only one Explore card. At most 50 selections can be configured. Allowed venue types are `attraction`, `restaurant`, `hotel_resort`, and `theater`. `sort_order` and `featured_order` accept integers 0–9999; lower numbers appear first and ID breaks ties. Null `featured_order` removes a venue from Home carousels without changing its publication or other content. A selected venue cannot be deleted or changed to an unsupported type until its card is removed. All changes are audited.

Home API errors follow the shared `{ error: { code, message, requestId, fields? } }` envelope: common outcomes are 401 for missing/invalid admin credentials, 404 for unknown IDs, 409 for duplicate selections or referenced deletion, and 422 for invalid fields or place type. Home search, cab and rental remain pending separate sections.

## 13. Error handling and screen states

```json
{
  "error": {
    "code": "INVALID_OTP",
    "message": "Code is invalid, expired or already used",
    "requestId": "example-request-id"
  }
}
```

`error.code`, `message`, `requestId` are present. `fields` is optional and can contain structured validation details; do not require a single map shape for every error. Branch on HTTP status and `code`, not English message text. Keep `requestId` available for support.

| Status/code                                                                                                                                         | App behavior                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 401 `UNAUTHENTICATED`                                                                                                                               | Protected session missing/invalid/expired; attempt one serialized refresh if eligible, otherwise show login  |
| 401 `INVALID_REFRESH_TOKEN`, `INVALID_VERIFICATION`                                                                                                 | Restart session or verification flow respectively                                                            |
| 403 `REAUTHENTICATION_REQUIRED`                                                                                                                     | Repeat phone sign-in before sensitive action                                                                 |
| 409 `PHONE_IN_USE`, `CUSTOMER_EXISTS`, `REGISTRATION_REQUIRED`                                                                                      | Follow the conflict-specific account/phone flow; no blind retry                                              |
| 422 `VALIDATION_FAILED`, `EMPTY_UPDATE`, `INVALID_OTP`, `INVALID_CHALLENGE`, `INVALID_FILTER`, `INVALID_TYPE`, `INVALID_PAGINATION`, `INVALID_DATE` | Show field/input/verification feedback as appropriate                                                        |
| 404 `NOT_FOUND`                                                                                                                                     | Resource absent/unavailable; handle missing photo with initials and missing venue with an unavailable screen |
| 429 `RATE_LIMITED`, `OTP_RATE_LIMITED`                                                                                                              | Show throttled/retry state; avoid immediate retry loops                                                      |
| 503 `OTP_UNAVAILABLE`, `OTP_DELIVERY_FAILED`, `LEGAL_CONTENT_UNAVAILABLE`                                                                           | Configuration/content/delivery unavailable; show a recoverable unavailable state                             |
| 409 `VEHICLE_UNAVAILABLE`, `TOO_MANY_PENDING_BOOKINGS`, `BOOKING_NOT_PAYABLE`, `CANCELLATION_WINDOW_CLOSED`, `IDEMPOTENCY_CONFLICT`, `NO_PAYMENT`, `REVIEW_NOT_ALLOWED` | Car rental: show the unavailable or hold/payment state; re-search or re-open the booking instead of retrying the same request |
| 422 `INVALID_RENTAL_PERIOD`, `INVALID_LOCATION`, `DRIVER_NOT_AVAILABLE`, `DRIVER_REQUIRED`, `BRANCH_CLOSED` | Car rental: show the field feedback on the search or checkout screen |
| 503 `PAYMENTS_NOT_CONFIGURED`, 502 `PAYMENT_GATEWAY_ERROR` | Car rental: recoverable payment unavailable state; do not open a payment page |
| 500 `INTERNAL_ERROR`                                                                                                                                | Generic error UI; record request ID                                                                          |

Every list screen should distinguish loading, valid empty data, loaded data, network failure and API error. Personalized lists/details are not shared-cache data. Respect server no-store behavior and clear account-specific local state after logout/deletion or account switching.

## 14. Handoff instructions for AI implementing the app

Copy this brief with this document and all four JSON OpenAPI files:

```text
Implement the mobile client against the implemented non-admin /api/v2 endpoints
listed in app-api-reference.md. Use customer-openapi.json, explore-openapi.json,
home-openapi.json and saved-addresses-openapi.json
for exact request/response schemas, status codes, required fields and nullability.
Keep persisted wire keys unchanged and reuse one model per canonical entity.
Use each endpoint's envelope: auth wraps customer/credentials; profile returns
Customer directly under data; lists return arrays; showtimes include related movies.
Preserve token/proof distinctions, rotation, guest behavior, locale fallback,
metadata joins, pagination, empty/error states and private image authentication.
Global search, notification event integrations, Schedule, cab requests, unified
cab/rental history and video/social APIs are pending. Car rental (`/api/v2/rentals/*` and
`/api/v2/customer/me/rental-bookings*`) is implemented: use rental-openapi.json. Do not invent their routes or treat plans as live.
SMS is not configured, so handle the documented 503 state without a bypass.
```

Suggested implementation order: shared API client/error decoding and canonical models → guest Home and Explore/list/detail → legal/login/session handling → profile/photo → bookmarks → theater showtimes → contact/settings/account controls.

The CMS/admin APIs are for editors, not mobile credentials. Their current references are in the [Customer guide](customer-api.md#cmsadmin), [Explore guide](explore-api.md#manage-place-details-in-the-cms) and [Home CMS section](#home-cms-and-admin-operations), with exact `/api/v2/admin` operations in the corresponding OpenAPI files. Older implementation plans and [website response examples](frontend-api-responses.md) are background material, not alternate mobile response contracts.

### Push notifications

Register the current Firebase Messaging token after sign-in with `POST /api/v2/customer/me/push-tokens`, supplying `{ "token": "<fcm-registration-token>", "platform": "ios" }` or `"android"`; an optional `device_id` lets a token refresh replace that device's previous token. Remove it on sign-out using `DELETE /api/v2/customer/me/push-tokens/{id}`. The API never echoes the token back.

Load the inbox with `GET /api/v2/customer/me/notifications?page=1&per_page=20`. Send `Accept-Language: ar` to get `title` and `body` in Arabic (English is used when a notification has no Arabic text); `title_en`/`body_en` and `title_ar`/`body_ar` are also returned. Notifications are newest first; `meta.unread_count` is the total unread count, independent of the current page. Mark one read with `PUT /api/v2/customer/me/notifications/{id}/read`, or all with `PUT /api/v2/customer/me/notifications/read-all`. Notification records are created only by trusted server workflows. `action_data` is nullable and currently has no app navigation contract.

The durable outbox retries failed FCM sends with backoff; deliveries stop after 10 unsuccessful attempts, and invalid tokens are removed. Set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY` in the server's secret configuration and run one or more `node ace notifications:deliver-push --watch` workers. FCM/APNs credentials and app-side notification permission/token handling are operational prerequisites. Ride/rental notifications remain inactive until their event sources are connected.

## 15. Keeping this reference current

For every implemented section, update its endpoint table, shared schemas, request/response examples, screen mappings and Postman requests together. Move a feature from Planned to Implemented only when its routes and behavior exist. Keep deployment/content prerequisites explicit. Do not append contradictory historical contract proposals to this integration guide.
