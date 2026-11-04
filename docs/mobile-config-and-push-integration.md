# Mobile app integration: configuration and push notifications

This document is the handoff for the mobile developer and their coding assistant. It describes the backend contracts and a suggested order for implementing app startup, version updates, maintenance mode, Firebase Cloud Messaging (FCM), and the notifications screen.

The backend implements these APIs. The mobile app still needs to integrate them. The examples use placeholder URLs, tokens, IDs, and notification text; replace them with values for the environment being used.

## 1. What is available

| Feature | Endpoint | Customer login required? |
| --- | --- | --- |
| App configuration | `GET /api/v2/config` | No |
| Register or refresh an FCM token | `POST /api/v2/customer/me/push-tokens` | Yes |
| Change the language of a registered device | `PATCH /api/v2/customer/me/push-tokens/{id}` | Yes |
| Remove a registered FCM token | `DELETE /api/v2/customer/me/push-tokens/{id}` | Yes |
| List notifications and unread count | `GET /api/v2/customer/me/notifications` | Yes |
| Mark one notification as read | `PUT /api/v2/customer/me/notifications/{id}/read` | Yes |
| Mark all notifications as read | `PUT /api/v2/customer/me/notifications/read-all` | Yes |

**Current limits:** Ride and rental event sources are not connected yet. The backend does not expose an app API for creating or deleting notification records, and notification tap destinations are not defined. An empty inbox is expected until a trusted backend workflow creates notifications. FCM delivery also requires server credentials and a running delivery worker; successful token registration alone does not prove push delivery is active.

## 2. Before implementation

1. Obtain the QA and live **configuration endpoint origins** from the backend team. These addresses have not yet been supplied in this document. Each app build must know the correct origin before it can fetch configuration; an API cannot provide its own first address.
2. Set up the matching Firebase app for each environment and platform. The mobile team handles the Firebase SDK, notification permissions, FCM registration token and platform capabilities. iOS delivery also requires APNs to be configured in Firebase.
3. Obtain a customer access token through the existing customer login flow. Customer access tokens are different from FCM device tokens. Guests can fetch configuration but cannot use the customer notification endpoints.
4. Coordinate with the backend team to apply migrations, configure FCM credentials and start the push worker. Do not put backend service-account credentials in the app.

Use the existing [Postman collection](postman/kuwaitiexperience.postman_collection.json): folder **00** contains app configuration, and folder **08B** contains notification and push-token requests. The [configuration OpenAPI](app-config-openapi.json) and [notification OpenAPI](notifications-openapi.json) provide the machine-readable schemas.

## 3. Shared request rules

- The endpoint paths in this document already include `/api/v2`. Join them to an origin such as `https://api.example.com`, with no trailing slash. Do not append `/api/v2` twice.
- Send `Accept: application/json`. Send `Content-Type: application/json` for JSON request bodies.
- Send the app's selected language as `Accept-Language: en` or `Accept-Language: ar` on configuration requests. English is used by default; missing or blank Arabic configuration text falls back to English for that field.
- Protected requests need `Authorization: Bearer <customer_access_token>`. Store customer credentials securely. Access and refresh tokens rotate on refresh; serialize refresh attempts so multiple 401 responses do not reuse the same refresh token. See the [app API reference](app-api-reference.md) for the existing authentication flow.
- API errors normally have the shape below. `fields` is optional; use `requestId` when reporting an issue to the backend team.

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Please correct the submitted fields",
    "requestId": "example-request-id"
  }
}
```

## 4. App configuration

### Fetch configuration at startup

```http
GET <bootstrap-origin>/api/v2/config
Accept: application/json
Accept-Language: en
```

No authentication or request body is needed. Example `200 OK` response:

```json
{
  "data": {
    "environment": "qa",
    "api_base_url": "https://qa-api.example.com",
    "image_base_url": "https://qa-api.example.com",
    "update": {
      "title": "Version update",
      "message": "A new version of the app is available.",
      "ios": {
        "version": "1.2.0",
        "force": true,
        "store_url": "https://apps.example.com/ios"
      },
      "android": {
        "version": "1.1.0",
        "force": false,
        "store_url": "https://apps.example.com/android"
      }
    },
    "maintenance": {
      "enabled": false,
      "title": "App under maintenance",
      "message": "The app is currently undergoing scheduled maintenance."
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `environment` | `qa`, `live`, or `null` if the backend environment is not configured. |
| `api_base_url` | Public API **origin** for later API requests. |
| `image_base_url` | Public **origin** used to resolve relative image paths returned by the API. |
| `update.title`, `update.message` | Text already localized for the requested language. |
| `update.ios`, `update.android` | Independent update settings. `version` and `store_url` can be `null`; `force` is a JSON boolean. |
| `maintenance.enabled` | JSON boolean indicating that the app should show the maintenance screen. The flag does not itself block other API requests. |
| `maintenance.title`, `maintenance.message` | Text already localized for the requested language. |

Resolve relative image paths against `image_base_url`. For example, origin `https://qa-api.example.com` plus `/api/v1/images/example.webp` gives `https://qa-api.example.com/api/v1/images/example.webp`. Do not add `/api/v1/images` a second time. The placeholders in this document are not real image IDs or deployment addresses.

### Startup behavior

1. Select the bootstrap origin for the installed QA or live build and fetch configuration before using its returned API origin.
2. Deserialize the `data` object and retain nullable fields. Choose `update.ios` on iOS and `update.android` on Android.
3. If maintenance is enabled, show the provided title and message and offer a way to retry the configuration request. The proposed app flow checks maintenance before showing an update prompt; confirm this display priority with the product team.
4. If maintenance is off and the platform's `version` is present, compare the installed app version with it as numeric `major.minor.patch` components. For example, `1.10.0` is newer than `1.9.0`; do not compare these versions as plain strings. Show an update only when the installed version is older. If `force` is true, the app should require the user to open that platform's store link; otherwise the prompt can be dismissed. When `version` is null, no update is configured.
5. `store_url` can be null. Do not construct or guess a store link; handle the unavailable link and report the configuration issue to the backend team. The CMS validates that a forced update has both a version and a store URL.
6. The response currently uses `Cache-Control: no-store`. Do not persist it as an offline cache until the backend and product teams agree on an appropriate caching policy. The earlier plan suggested keeping the last successful configuration, so that policy needs to be resolved before implementing that fallback. For now, refresh when the app starts or returns to the foreground, refresh localized text when the language changes, and show an error and retry action when configuration is unavailable. The product team should decide the precise offline behavior for maintenance and forced updates.

## 5. FCM token lifecycle

1. After the user grants notification permission, obtain the current FCM registration token from the Firebase SDK. Permission denial must not prevent normal app use.
2. Once the customer has signed in, register the token with the backend. If permission or token acquisition happens before sign-in, register after sign-in.
3. Keep the returned **push-token record ID** for this installation and account. It is needed for removal on sign-out.
4. Register again when Firebase rotates the token, after a new sign-in, or when the app discovers the registration is missing. Supply a stable, app-generated installation `device_id` if available. It is optional, but lets the backend replace the previous token for the same device and customer. Do not use a sensitive hardware identifier.
5. Before signing out, delete the current device's push-token record while the customer session is still valid. Then perform the existing logout flow. A missing record returns 404; treat that as already removed. If removal cannot be confirmed because the device is offline or the session is expired, the app cannot guarantee the server has removed that token: handle the sign-out locally and coordinate a retry strategy with the backend team.
6. On an account switch, register the current FCM token under the newly signed-in customer. Do not send the FCM token as the bearer token or write it to application logs.

### Register or refresh the current device token

```http
POST <api_base_url>/api/v2/customer/me/push-tokens
Authorization: Bearer <customer_access_token>
Content-Type: application/json
```

```json
{
  "token": "<fcm-registration-token>",
  "platform": "android",
  "device_id": "<app-generated-installation-id>",
  "language": "ar"
}
```

`platform` must be `ios` or `android`. `device_id` is optional, 1–128 characters; `token` is required, 1–4096 characters. `language` is optional, `en` or `ar`: send the app's current language so push notifications arrive in it (see "Push language" below). Example `201 Created` response:

```json
{
  "data": {
    "id": 42,
    "platform": "android",
    "device_id": "<app-generated-installation-id>",
    "language": "ar",
    "created_at": "2026-10-30T10:00:00.000Z",
    "updated_at": "2026-10-30T10:00:00.000Z"
  }
}
```

The FCM token itself is not returned. On each successful registration, replace the locally stored record ID with `data.id`; token rotation can create a new record. Invalid input returns 422. An expired or invalid customer session returns 401.

### Push language

The backend stores one language (`en` or `ar`) for each registered device and uses it to choose the text of every push. Arabic is used only when the notification has both an Arabic title and an Arabic message; otherwise English is sent. A device that never sends a language receives English.

1. Send the app's current language as `language` whenever you register the token (first launch after sign-in, token rotation, new sign-in). Registering again without `language` keeps the saved value.
2. When the user changes the app language, update the saved record with the call below. Do not wait for the next token refresh.

```http
PATCH <api_base_url>/api/v2/customer/me/push-tokens/42
Authorization: Bearer <customer_access_token>
Content-Type: application/json
```

```json
{ "language": "ar" }
```

`42` is the record ID from registration. `language` is required and must be `en` or `ar`, otherwise `422`. Success is `200 OK` with the same record shape as registration. A record that does not belong to the current customer returns `404`. The language belongs to the device, not the account, so a customer signed in on two phones can use different languages.

### Remove the current device token

```http
DELETE <api_base_url>/api/v2/customer/me/push-tokens/42
Authorization: Bearer <customer_access_token>
```

Success is `204 No Content` with **no response body**. `42` is the record ID from registration, not the FCM token or the customer ID. A record that does not exist for the current customer returns 404.

## 6. Notifications screen

### List notifications

```http
GET <api_base_url>/api/v2/customer/me/notifications?page=1&per_page=20
Authorization: Bearer <customer_access_token>
```

`page` defaults to 1; `per_page` defaults to 20 and accepts 1–50. Results are newest first. Example `200 OK`:

```json
{
  "data": [
    {
      "id": 17,
      "type": "example_event",
      "title": "Example notification",
      "body": "Your update is available.",
      "action_data": null,
      "created_at": "2026-10-30T10:00:00.000Z",
      "read_at": null
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 1,
    "last_page": 1,
    "unread_count": 1
  }
}
```

- `data` is an array, including when empty. `action_data` is an object or `null`. `read_at: null` means unread; otherwise it is an ISO timestamp. `created_at` is an ISO timestamp: the app can format it as “now”, “2 min”, or a date in the device's timezone.
- `meta.unread_count` is for all of the customer's notifications, not just the current page. Use it for a badge. Invalid pagination returns 422.
- Each item also has `title_ar` and `body_ar`, which are `null` when no Arabic text was provided. `title` and `body` are always English. Show the Arabic pair when the app language is Arabic and both values are non-empty; otherwise show `title` and `body`. The inbox does not use `Accept-Language`. Do not assume `type` values or a navigation destination from this example.

### Mark one as read

```http
PUT <api_base_url>/api/v2/customer/me/notifications/17/read
Authorization: Bearer <customer_access_token>
```

No body is needed. A `200 OK` response contains the updated record under `data`, in the same shape as a list item, with `read_at` set. Calling it again leaves the existing read time in place. A missing or another customer's notification returns 404. Refresh the list or update the local unread count after success.

### Mark all as read

```http
PUT <api_base_url>/api/v2/customer/me/notifications/read-all
Authorization: Bearer <customer_access_token>
```

No body is needed. Success returns `204 No Content` and no JSON body. Refresh the inbox and badge, or update them locally after success.

## 7. Receiving an FCM message

The backend sends an FCM notification with `title` and `body` in the device's saved push language (see "Push language"), plus string data values:

```json
{
  "notification_id": "17",
  "type": "example_event",
  "title_en": "Example notification",
  "body_en": "Your update is available.",
  "title_ar": "إشعار تجريبي",
  "body_ar": "تحديثك متاح."
}
```

`title_ar` and `body_ar` are present only when the notification has Arabic text. Both languages are always in the data, so a foreground handler can also choose its own.

If a backend event includes `action_data`, the FCM data payload also includes an `action_data` **JSON string**. In the inbox API the corresponding value is an object or `null`. Handle absent fields and invalid JSON safely. These are the data fields, not the entire Firebase SDK message object.

Implement foreground, background and terminated-app handling according to the mobile platform and Firebase SDK. On receiving or opening a notification, refresh the authenticated inbox and unread count when practical. Background delivery and presentation depend on platform permissions and OS behavior; push delivery is not guaranteed. Avoid displaying the same message twice when the OS already displays it, and keep the inbox as the source for read state.

**Navigation is not defined yet.** Do not route users to a ride, rental, or other destination based on `type` or `action_data` until the product and backend teams define and deliver that contract.

## 8. Error and retry handling

| Situation | App behavior |
| --- | --- |
| `401` on a customer endpoint | Use the existing serialized refresh flow; if refresh fails, clear the session and return to login. |
| `404` on token removal | The record is absent for this customer; treat it as already removed. |
| `404` on mark-read | Refresh the inbox; the record may no longer be available to this customer. |
| `422` | Inspect the error and correct the submitted fields or pagination. |
| `429` | Back off and retry later. Token registration/removal and read actions share a backend limit of 120 requests per customer per minute. |
| Network error or `5xx` | Show a recoverable state. Retry carefully; do not assume a state-changing request failed if the response was lost. |
| `204` | Treat as success without attempting to decode a JSON response body. |

## 9. Suggested implementation and acceptance checklist

- [ ] Configure distinct bootstrap origins and Firebase apps for QA and live; never mix tokens between environments.
- [ ] Fetch configuration without login; handle English, Arabic, missing Arabic text, null versions/links, maintenance, optional updates and forced updates.
- [ ] Compare numeric version components correctly, including `1.10.0` versus `1.9.0`; handle a missing store URL without inventing a link.
- [ ] Handle offline startup, refresh on foreground, and language changes. Agree on the server caching policy before implementing an offline configuration cache; keep any approved caches separate by environment.
- [ ] Request notification permission at the agreed point, register after login, re-register on token refresh and account changes, and remove the saved token ID before logout.
- [ ] Send `language` when registering the token and call `PATCH /customer/me/push-tokens/{id}` whenever the user changes the app language; verify an Arabic device receives Arabic text and an English device English.
- [ ] Build inbox pagination, empty/error/loading states, read state and unread badge from the documented response. Correctly handle 200, 204, 401, 404, 422 and 429.
- [ ] Verify foreground and background push handling on real iOS and Android devices once FCM/APNs and the backend worker are configured. Use a backend-coordinated test notification; there is currently no public API to create one.
- [ ] Keep notification tap navigation disabled or generic until a destination contract is agreed. Confirm with the backend team when ride/rental events are connected.
