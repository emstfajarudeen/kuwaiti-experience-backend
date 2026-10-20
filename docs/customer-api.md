# Customer account and support API

Implemented base: `/api/v2`. OpenAPI: [customer-openapi.json](customer-openapi.json). These endpoints implement the first selected App 2 screens. Existing v1 responses remain a legacy contract; mobile clients should use v2 for this section. The rest of App 2 is still planned.

Postman: import the [collection](postman/kuwaitiexperience.postman_collection.json) and [local environment](postman/local.postman_environment.json). See the [testing instructions](postman/README.md) for login, profile/photo, phone changes and CMS requests.

Edit Profile is also implemented: see [customer-profile-api.md](customer-profile-api.md) for profile save, private photo upload/removal and session-bound phone-change OTPs. All Customer responses now include nullable `profile_photo_id`.

## Phone verification and login

1. `POST /customer/auth/otp` with `{ "phone_e164": "+96590987788" }`. Success is HTTP 202: `{ "data": { "id": "<uuid>", "expires_at": "<UTC ISO date>", "resend_available_at": "<UTC ISO date>" } }`. No account information or OTP is returned. SMS delivery is disabled until configured.
2. Display four numeric boxes and derive the resend timer from `resend_available_at`. `POST /customer/auth/otp/{id}/resend` after that time returns the same receipt shape. Codes expire after 5 minutes; resend cooldown is 60 seconds; each phone is limited to 5 sends per hour and each challenge to 5 guesses. Re-requesting a code does not bypass the phone budget. Authentication routes are additionally limited to 30 requests per IP per minute.
3. `POST /customer/auth/otp/{id}/verify` with `{ "code": "0123" }`. Keep the code as a string to preserve leading zeros. Success: `{ "data": { "next_action": "sign_in", "verification_token": "<opaque proof>", "expires_in": 600 } }`; `next_action` is `sign_in` or `create_account`. This proof is one use and must not be treated as an authenticated session.
4. For `sign_in`, `POST /customer/auth/session` with `{ "verification_token": "<proof>" }`.
5. For `create_account`, fetch both legal pages, display them, then `POST /customers` with the verified proof and legal hashes:

```json
{
  "verification_token": "<proof>",
  "first_name": "Mariam",
  "last_name": "Al-Khaled",
  "email": null,
  "legal_acceptances": [
    { "slug": "privacy-policy", "locale": "en", "content_hash": "<page meta.content_hash>" },
    { "slug": "terms-and-conditions", "locale": "en", "content_hash": "<page meta.content_hash>" }
  ]
}
```

Account creation returns HTTP 201; sign-in/refresh return HTTP 200. All three return the same schema:

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
      "phone_verified_at": "2026-10-20T06:00:00.000Z",
      "created_at": "2026-10-20T06:00:00.000Z",
      "updated_at": null
    },
    "credentials": {
      "access_token": "<opaque customer access credential>",
      "refresh_token": "<opaque rotating refresh credential>",
      "expires_in": 900
    }
  }
}
```

Customer credentials are opaque tokens with digests stored in the database, isolated from admin JWTs. Access expires in 15 minutes and sessions have a 7-day absolute lifetime. Store credentials in the mobile OS secure storage. Send `Authorization: Bearer <access_token>` to authenticated customer calls. `GET /customer/me` returns exactly the same `customer` object under `data`. No aliases such as `name`/`phone` or omitted nullable keys occur. The app composes the display name and initials.

`POST /customer/auth/refresh` takes `{ "refresh_token": "<token>" }` without an Authorization header. Refresh rotates both credentials and invalidates the old access token. Reuse of an old refresh token revokes that session. API routes reject CMS cookies and admin credentials.

"Continue as guest" is app-local and requires no token. Public content, contact and legal requests work without a customer session. Profile editing is documented separately above; saved addresses/items remain outside the implemented scope.

## Logout and deletion

`POST /customer/auth/logout` with customer bearer auth revokes the current session and returns HTTP 204 with no body. Clear local credentials afterward. Other sessions remain valid. Repeating the request with the revoked credential returns 401.

`DELETE /customer/me` returns HTTP 204 after a transaction permanently erases the customer, all sessions/refresh digests, legal acceptance snapshots, matching phone OTP state, and contact requests associated with that customer. Auth must originate from an OTP verification within the past 10 minutes; otherwise HTTP 403 `REAUTHENTICATION_REQUIRED` tells the app to repeat the existing phone login flow and retry. No password is used.

Guest contact submissions have no verified customer owner and are not deleted by matching unverified email/name text. Future booking/payment retention needs a separate policy before those tables are introduced. The current implementation has no booking/payment records to retain. The same verified phone may create a new account after deletion; old credentials remain invalid.

## Legal pages and consent

`GET /pages/privacy-policy?locale=en` and `GET /pages/terms-and-conditions?locale=en` return a complete persisted `pages` object with a `page_translations` array. Public and v2 admin read endpoints share one serializer. Keys retain their SQL names: `id`, `slug`, `status`, `published_at`, `created_at`, `updated_at`; translation keys are `id`, `page_id`, `locale`, `title`, `body`, `seo_title`, `seo_description`. Nullable values are always present. The array contains available translations. `meta.locale` selects the requested locale with English fallback; `meta.content_hash` identifies that exact slug/locale/title/body. Render `body` as text; do not inject it as trusted HTML.

Registration checks the submitted hashes under a transaction and stores immutable snapshots of the accepted text. If text changes, HTTP 409 `LEGAL_CONTENT_CHANGED` requires rereading and accepting it. Both distinct legal slugs are required. Draft/future pages are hidden. Missing legal pages return 404; recognized unrelated Figma placeholder copy returns 503 `LEGAL_CONTENT_UNAVAILABLE`.

Use the existing CMS Pages editor to publish approved Kuwaitiexperience English/Arabic content under these slugs. The supplied screenshot text and demo seed text are not approved legal policies. No legal copy is automatically seeded or published.

## Contact and WhatsApp

`POST /contact-requests` takes `{ "full_name": "Mariam Al-Khaled", "email": "mariam@example.com", "message": "Please help with my enquiry" }`. All three are required; names are 1–120 characters, email is at most 254, and the trimmed message is 1–300 characters. HTTP 201 returns `{ "data": { "id": 1, "created_at": "<UTC ISO date>" } }`, a submission receipt. Guest requests are permitted. A valid optional customer bearer token associates the message with that account; invalid credentials are rejected. Limit: 5 submissions per IP per hour. The durable CMS inbox is the support workflow; no outbound email is claimed.

`GET /site` exposes the same safe database field names as `GET /admin/site`: `id`, `brand_name`, `whatsapp_number`, `contact_email`, `app_store_url`, `play_store_url`, `logo_image_url`, `updated_at`. `logo_image_url` is the public logo path (`/api/v1/images/{key}`, relative to the API origin) or `null`. Build a `https://wa.me/<digits-only-whatsapp_number>` link in the app. If `whatsapp_number` is null, hide the contact button. Configure it through the existing CMS Site settings.

## CMS/admin

Browser inbox: `/admin/contact-requests`; detail and status form: `/admin/contact-requests/{id}`. Existing signed admin cookies, CSRF and no-store rules apply. Customer-submitted text is escaped. Statuses: `new`, `in_progress`, `resolved`.

Admin bearer endpoints under `/api/v2/admin`: `GET /contact-requests?page=1&status=new`, `GET /contact-requests/{id}`, `PATCH /contact-requests/{id}` with `{ "status": "resolved" }`. List/show/update use the exact same `ContactRequest` serializer, including `id`, nullable `customer_id`, `full_name`, `email`, `message`, `status`, `created_at`, nullable `updated_at`. List metadata uses `page`, `per_page` (20), `total`, `last_page`. Status updates are audited. No public read endpoint exposes messages.

`GET /admin/pages/{slug}?locale=en` and `GET /admin/site` reuse the exact v2 public serializers, with admin authentication. Existing v1 CMS APIs keep their legacy shapes for compatibility.

## Errors and deployment

Errors use the existing `{ "error": { "code": "INVALID_OTP", "message": "...", "requestId": "...", "fields": {} } }` structure; `fields` is consistently optional for errors with field details. Common codes: 401 `UNAUTHENTICATED`, `INVALID_VERIFICATION`, `INVALID_REFRESH_TOKEN`; 422 `VALIDATION_FAILED`, `INVALID_CHALLENGE`, `INVALID_OTP`, `LEGAL_ACCEPTANCE_REQUIRED`; 409 `CUSTOMER_EXISTS`, `REGISTRATION_REQUIRED`, `LEGAL_CONTENT_CHANGED`; 429 `OTP_RATE_LIMITED`, `RATE_LIMITED`; 503 `OTP_UNAVAILABLE`, `OTP_DELIVERY_FAILED`, `LEGAL_CONTENT_UNAVAILABLE`. Missing resources are 404 `NOT_FOUND`. Clients should branch on status/code, not message wording. v2 responses use `Cache-Control: no-store`.

Apply migration `1760000000006_create_customer_accounts` using the normal controlled migration process. This adds customer/support tables only. It does not migrate v1 payloads or seed data. Phone delivery requires `CUSTOMER_OTP_SECRET` (independent random secret, 32+ characters), `SMS_WEBHOOK_URL` (HTTPS) and `SMS_WEBHOOK_TOKEN`. The webhook adapter receives `{ "phone_e164": "...", "message": "..." }` with a bearer credential, must synchronously accept the SMS and return 2xx. Redirects are rejected and timeout is 10 seconds. Configure the eventual SMS provider behind this adapter or implement a direct sender. Until then, request/resend fails closed with 503 and never returns a code. Resend email is not used for phone verification, per the user's decision.

Verified 20 October 2026: `node ace test functional` passed all 25 tests (12 customer/support tests including concurrent OTP requests and verification); `npm run typecheck`, `npm run lint`, `npm run build` passed. The new migration was applied to local `kuwaitiexperience_dev` without reseeding existing data. Tests used only `kuwaitiexperience_test`. Real SMS delivery and approved legal copy remain configuration/content inputs.
