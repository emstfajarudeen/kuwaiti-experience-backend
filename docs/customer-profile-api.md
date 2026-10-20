# Edit Profile API

Base: `/api/v2/customer`. All calls require the customer's `Authorization: Bearer <access_token>`. Names, optional email, phone and photo in the supplied Edit Profile screen are supported. Exact schemas are included in [customer-openapi.json](customer-openapi.json) and the main OpenAPI file.

## Load and save

`GET /me` loads the canonical Customer. Every Customer returned by login, registration, refresh, profile save, photo upload and photo removal now includes `profile_photo_id` (UUID string or `null`) alongside the existing database keys. The app combines `first_name`/`last_name` to display initials.

`PATCH /me` accepts any of the following fields. Omitted fields retain their current value; sending `email: null` clears the email. Empty names and invalid email/phone formats are rejected. Send email as `null` rather than an empty string. The response is HTTP 200 with `{ "data": <Customer> }`, using exactly the same key set/types as `GET /me` and authentication results.

```json
{
  "first_name": "Zia",
  "last_name": "Ali",
  "email": null
}
```

Names are trimmed, 1–120 characters. Email is normalized to lowercase, at most 254 characters. An empty update is rejected with 422 `EMPTY_UPDATE`. Every persisted attribute retains its database spelling. `updated_at` is updated on a successful save.

## Phone changes

Keep the current phone until the new one has been verified. The user must have authenticated using their current phone within the last 10 minutes to request/resend a phone-change code. If HTTP 403 `REAUTHENTICATION_REQUIRED` occurs, repeat the normal phone sign-in flow first.

1. `POST /me/phone/otp` with `{ "phone_e164": "+96590987222" }`. The phone must differ from the current phone and must not belong to an existing customer. Response is HTTP 202 with the usual `{ data: { id, expires_at, resend_available_at } }` OTP receipt.
2. `POST /me/phone/otp/{id}/resend` resends after the server cooldown. The same limits apply: a code expires in 5 minutes, 5 attempts per challenge, 60 seconds before resend, and 5 sends per phone per hour. These budgets are shared with sign-in codes, so switching flows cannot bypass them.
3. `POST /me/phone/otp/{id}/verify` with `{ "code": "0123" }`. Response is `{ "data": { "next_action": "update_phone", "verification_token": "<one-use proof>", "expires_in": 600 } }`.
4. `PATCH /me` with the verified `phone_e164` and the proof under `phone_verification_token`. Names/email may be included in the same atomic save:

```json
{
  "first_name": "Zia",
  "phone_e164": "+96590987222",
  "phone_verification_token": "<proof from the authenticated phone-change endpoint>"
}
```

The proof is bound to both the customer and the session that requested it. It cannot be used by another session/customer, or exchanged for a login/registration session. Normal sign-in proofs cannot change a phone. Wrong, expired or reused proof is rejected without changing any profile fields. The server rechecks phone uniqueness at save time. A successful phone change updates `phone_verified_at`, revokes every other customer session and refresh token, and keeps the initiating session valid. The Customer ID and owned data remain unchanged.

Errors: 422 `PHONE_UNCHANGED`, `PHONE_VERIFICATION_REQUIRED`, `PHONE_MISMATCH`, `INVALID_OTP`, `INVALID_CHALLENGE`; 409 `PHONE_IN_USE`; 401 `INVALID_VERIFICATION`; existing rate-limit codes. Phone verification still returns 503 until the SMS adapter is configured, as previously requested. Names, email and photos work independently of SMS configuration.

## Profile photo

The camera control uses `POST /me/photo` with `multipart/form-data`, field `file`. JPEG/JPG/PNG/WebP is accepted, up to 5 MB and 20 megapixels. Animated/multipage or corrupt images are rejected. The server rotates the image, resizes within 1024×1024, strips original metadata and re-encodes WebP. Successful upload/replacement returns HTTP 200 and the canonical Customer with its new `profile_photo_id`. Uploads are limited to 20 per customer per hour.

`GET /me/photo` returns private `image/webp` bytes with `Cache-Control: no-store`. Fetch it with the customer bearer header and display the returned bytes/blob. It is not a public URL and it is not served through the public `/api/v1/images/{key}` endpoint. If `profile_photo_id` is null or no photo exists, render initials; the photo endpoint returns 404. Another account cannot read the photo using its own `/me/photo` request.

`DELETE /me/photo` removes the photo and returns HTTP 200 with the canonical Customer, `profile_photo_id: null`. Upload and removal save immediately; the Save button submits the text/verified-phone fields via PATCH. The app should handle those operations separately so discarding text edits does not imply that an already uploaded photo was rolled back.

Old files are removed after successful replacement/removal; account deletion also removes the current private file. Files live under private `customer-profiles/` storage, separate from CMS editorial images. If filesystem cleanup fails after a committed DB change, the server records a cleanup warning. The operator command `images:prune-orphans` also recognizes unreferenced profile files older than one hour; `--delete` removes those managed orphans after inspection. Referenced photos and recent in-flight uploads are protected. Back up these files with the customer database.

## Migration

`1760000000007_add_customer_profile` adds nullable `customers.profile_photo_id` and OTP purpose/customer/session binding columns. Existing customers receive `profile_photo_id: null`; the previous Customer keys retain their types and names. Existing OTP rows default to the sign-in purpose. This is an additive migration; no reseeding is needed.
