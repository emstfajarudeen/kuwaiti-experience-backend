# Videos API – App Integration Reference

Everything lives under **`/api/v2`**; video files are served from **`/api/v1/video-files/…`**. Replace `{BASE_URL}` with your environment's API host.

## Overview

The Videos API powers the app's short-video feed: browsing, watching, and interacting (like, save, share, comment, report).

| Action | Guest (no token) | Signed-in customer |
| --- | --- | --- |
| Browse feed, open a video, read comments, list report reasons | Yes | Yes (adds `viewer` state and `mine` flags) |
| Like, save, share, comment, delete own comment, like a comment, report, list saved videos | No (401) | Yes |

**What the app is allowed to see.** A video appears in the API only when it is published, its publish time has passed, and its linked business (place), if any, is also published. Otherwise it returns `404 NOT_FOUND` everywhere, including on interaction endpoints.

**Who is shown as the creator.** If the video is linked to a business, the creator is that business. Otherwise it is the platform account with handle `thekuwaitiexperience`.

**Video files.** Uploads are MP4, MOV or WebM up to 25 MB; the stored file is delivered as MP4 or WebM with HTTP Range support, so the native player can seek.

## Conventions

| Header | When | Notes |
| --- | --- | --- |
| `Authorization: Bearer ca_…` | Customer endpoints; optional on read endpoints | Customer access token. A malformed token on a read endpoint returns 401 rather than being ignored. |
| `Accept-Language: ar` or `en` | Any read endpoint | Picks caption, category and report-reason language. Default `en`; empty translations fall back to English. |
| `Content-Type: application/json` | POST bodies | Comment and report bodies are JSON. |

**Signing in.** Same customer token as the rest of the app. Flow: `POST /api/v2/customer/auth/otp` (phone) → `POST /api/v2/customer/auth/otp/:id/verify` (code, returns a short-lived `verification_token`) → `POST /api/v2/customer/auth/session` for an existing customer, or `POST /api/v2/customers` for a new one. Both return `access_token`, `refresh_token` and `expires_in`; renew with `POST /api/v2/customer/auth/refresh` (`{ "refresh_token": "…" }`). Send `Authorization: Bearer <access_token>` on every video call, including reads, so the feed returns `viewer.liked` and `viewer.saved`. Sending CMS cookies instead returns `400 CONFLICTING_AUTH`.

**Response envelope.** Success is `{ "data": … }`, plus `"meta"` on lists. Errors are always:

```json
{
  "error": {
    "code": "INVALID_COMMENT",
    "message": "Write a comment up to 500 characters",
    "fields": { "body": ["Write a comment up to 500 characters"] },
    "requestId": "…"
  }
}
```

`fields` appears only for validation errors. Log `requestId` when reporting a problem. Branch on `code`, never on `message`.

**Pagination.** The feed and comments use opaque cursors: pass `meta.next_cursor` from the last page as `cursor`; `null` means no more pages. Saved videos use `page` and return `meta.has_more`.

**Caching.** Feed, detail, comments and all customer calls are `Cache-Control: no-store`.

**Rate limits.** Likes, saves, shares, comment deletes and comment likes: 120 requests/minute per customer. Posting a comment and reporting: 20/minute per customer. Over the limit returns `429 RATE_LIMITED`.

## Data models

### Video

| Field | Type | Notes |
| --- | --- | --- |
| `id` | integer | |
| `caption` | string | Requested language, falling back to English. |
| `video_url` | string | Relative path such as `/api/v1/video-files/<uuid>.mp4`. Prefix with `{BASE_URL}`. |
| `thumbnail_url` | string or null | Relative path such as `/api/v1/images/…`; use as the poster frame. |
| `category_id`, `category_name` | integer or null, string or null | |
| `creator` | object | See below. |
| `actions.phone` | string or null | E.164, for the Call button. Falls back to the business phone. |
| `actions.location` | object or null | `{ name, latitude, longitude }` for the Location button. Falls back to the business location. |
| `counts` | object | `likes`, `comments`, `shares`, `saves` (integers). |
| `viewer` | object | `liked`, `saved` (booleans). Always `false` for guests. |
| `published_at` | ISO 8601 string | |

### Creator

| Field | Type | Notes |
| --- | --- | --- |
| `type` | `business` or `platform` | `platform` when the video has no business. |
| `name` | string | Business title, or the site brand name. |
| `handle` | string | Shown as `@handle`. Business slug, or `thekuwaitiexperience`. |
| `subtitle` | string or null | The video's category name. |
| `avatar_url` | string or null | Relative path; business cover image or site logo. |
| `place_id`, `place_slug` | integer or null, string or null | Use to open the business page. Null for the platform. |

### Comment

| Field | Type | Notes |
| --- | --- | --- |
| `id` | integer | |
| `body` | string | Up to 500 characters. |
| `author.name` | string | First name plus last initial (`Sara A.`); `Guest` if empty. |
| `author.initials` | string | Up to two letters, for the avatar fallback. |
| `like_count` | integer | |
| `liked` | boolean | Whether the signed-in customer liked it. |
| `mine` | boolean | True for the customer's own comments; show the delete option. |
| `created_at` | ISO 8601 string | |

### Report reason

`{ code, label }`. The `label` is localized; send the `code` back when reporting.

## Endpoints

All paths are relative to `{BASE_URL}/api/v2`. Auth is **Guest** (token optional) or **Customer** (token required).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/videos` | Guest | Newest-first feed, cursor paging |
| GET | `/videos/report-reasons` | Guest | Reasons for the report sheet |
| GET | `/videos/:id` | Guest | One video (deep link, refresh) |
| GET | `/videos/:id/comments` | Guest | Comments, newest first |
| GET | `/customer/me/saved-videos` | Customer | The customer's saved videos |
| PUT / DELETE | `/videos/:id/like` | Customer | Like / unlike |
| PUT / DELETE | `/customer/me/saved-videos/:id` | Customer | Save / unsave |
| POST | `/videos/:id/share` | Customer | Count a share |
| POST | `/videos/:id/comments` | Customer | Add a comment |
| DELETE | `/video-comments/:id` | Customer | Delete own comment |
| PUT / DELETE | `/video-comments/:id/like` | Customer | Like / unlike a comment |
| POST | `/videos/:id/report` | Customer | Report a video |
| GET | `/api/v1/video-files/:name` | Public | The video file (Range supported) |

### GET /videos

Query: `limit` (1–30, default 10), `cursor`, `category_id`, `place_id`. Filters must be positive integers, otherwise `422 INVALID_FILTER`; a bad cursor returns `422 INVALID_CURSOR`.

```json
{
  "data": [
    {
      "id": 42,
      "caption": "Sunset at Kuwait Towers",
      "video_url": "/api/v1/video-files/6f1c2e9a-3b7d-4c1e-9a52-1d0f8e7b6a45.mp4",
      "thumbnail_url": "/api/v1/images/video-thumb-42.webp",
      "category_id": 3,
      "category_name": "Landmarks",
      "creator": {
        "type": "business",
        "name": "Kuwait Towers",
        "handle": "kuwait-towers",
        "subtitle": "Landmarks",
        "avatar_url": "/api/v1/images/demo-kuwait-towers.webp",
        "place_id": 7,
        "place_slug": "kuwait-towers"
      },
      "actions": {
        "phone": "+96522221234",
        "location": { "name": "Arabian Gulf Street", "latitude": 29.3972, "longitude": 48.0003 }
      },
      "counts": { "likes": 128, "comments": 9, "shares": 14, "saves": 31 },
      "viewer": { "liked": true, "saved": false },
      "published_at": "2026-11-02T16:30:00.000Z"
    }
  ],
  "meta": { "next_cursor": "MTc2MjEwMDYwMDAwMDo0Mg" }
}
```

### GET /videos/:id

Returns `{ "data": <Video> }`. `404 NOT_FOUND` when the id is invalid, unpublished, or its business is unpublished.

### GET /videos/report-reasons

Returns `{ "data": [{ "code": "spam", "label": "Spam or misleading content" }, …] }`. Codes: `sexual`, `violence`, `hate`, `harassment`, `spam`, `self_harm`, `illegal`, `other`. Fetch once per session and cache.

### GET /videos/:id/comments

Query: `limit` (1–50, default 20), `cursor`. Hidden (moderated) comments are never returned.

```json
{
  "data": [
    {
      "id": 311,
      "body": "Beautiful view!",
      "author": { "name": "Sara A.", "initials": "SA" },
      "like_count": 2,
      "liked": false,
      "mine": false,
      "created_at": "2026-11-03T08:12:44.000Z"
    }
  ],
  "meta": { "next_cursor": "311" }
}
```

### GET /customer/me/saved-videos

Query: `limit` (1–50, default 20), `page` (default 1). Returns the same Video objects, most recently saved first, with `meta: { "has_more": true }`. Videos unpublished since saving are omitted.

### Like and save

`PUT` adds, `DELETE` removes. Both are idempotent, so retries are safe.

- `PUT|DELETE /videos/:id/like`
- `PUT|DELETE /customer/me/saved-videos/:id`

```json
{ "data": { "video_id": 42, "active": true, "count": 129 } }
```

`active` is the new state and `count` is the new total; update the UI from the response.

### POST /videos/:id/share

No body. Call it after the share sheet is opened. Each call adds one share (not deduplicated).

```json
{ "data": { "video_id": 42, "count": 15 } }
```

### POST /videos/:id/comments

Body: `{ "body": "Beautiful view!" }`. Trimmed, 1–500 characters. Returns `201` with the new comment; it is visible immediately, so insert it at the top.

```json
{ "data": { "id": 312, "body": "Beautiful view!", "author": { "name": "Omar K.", "initials": "OK" }, "like_count": 0, "liked": false, "mine": true, "created_at": "2026-11-03T09:01:10.000Z" } }
```

### DELETE /video-comments/:id

Deletes the customer's own comment. Another customer's comment returns `403 FORBIDDEN`. Returns `{ "data": { "id": 312 } }`; decrement the comment count locally.

### Like a comment

`PUT|DELETE /video-comments/:id/like`, idempotent. Returns `{ "data": { "comment_id": 311, "active": true, "count": 3 } }`. Hidden comments return `404`.

### POST /videos/:id/report

Body: `{ "reason": "spam", "note": "optional, max 500 characters" }`. `reason` must be a code from `/videos/report-reasons`. Returns `201`:

```json
{ "data": { "video_id": 42, "reported": true } }
```

Reporting the same video twice is not an error and keeps the first report, so always show a thank-you on success.

## Error codes

| HTTP | `code` | When | What the app should do |
| --- | --- | --- | --- |
| 401 | `UNAUTHENTICATED` | Missing, malformed or expired token on a Customer endpoint | Refresh the token once and retry; if that fails, send the customer to sign in. Guests tapping like or comment should see the sign-in prompt before any request. |
| 403 | `ACCOUNT_DISABLED` | Account deactivated by an admin | Sign out and show a "your account is deactivated" message. |
| 403 | `FORBIDDEN` | Deleting someone else's comment | Hide the delete option when `mine` is false. |
| 400 | `CONFLICTING_AUTH` | CMS cookies sent to a customer API | Do not send cookies from the app's HTTP client. |
| 404 | `NOT_FOUND` | Video or comment is missing, unpublished, hidden, or its business is unpublished | Remove the item and show "This video is no longer available". |
| 422 | `INVALID_COMMENT` | Empty or over 500 characters | Show `error.fields.body[0]` under the input. |
| 422 | `INVALID_REASON` | Report reason not in the list | Re-fetch reasons; show `error.fields.reason[0]`. |
| 422 | `INVALID_FILTER` | `limit`, `category_id`, `place_id` or `page` not a positive integer | A client bug; fix the request. |
| 422 | `INVALID_CURSOR` | Cursor was altered | Restart the feed without a cursor. |
| 429 | `RATE_LIMITED` | Over 120 actions or 20 comments/reports per minute | Back off a few seconds; do not retry in a loop. |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Show a generic retry message and log `requestId`. |

Video file requests (`/api/v1/video-files/…`) return `404 NOT_FOUND` for an unpublished or unknown file, and `416` for an invalid Range.

## Integration guide

**Feed screen**

1. On open, call `GET /videos?limit=10` and `GET /videos/report-reasons` (cache the reasons).
2. Play the video in view; prefetch the next one or two `video_url`s. Use `thumbnail_url` as the poster while buffering.
3. When the user is within three items of the end, call `GET /videos?cursor=<next_cursor>`. Stop when `next_cursor` is `null`.
4. Pull-to-refresh restarts from the first page with no cursor. New videos only appear at the top.

**Rendering a video card**

- Header: `creator.avatar_url`, `creator.name`, `@creator.handle`, `creator.subtitle`. When `creator.type` is `business`, tapping opens the business page via `place_id` or `place_slug`; the platform account has nothing to open.
- Call button only when `actions.phone` is not null. Location button only when `actions.location` is not null.
- Counters come from `counts`; icon state comes from `viewer`.

**Interactions**

1. Check for a token first. With no token, show the sign-in prompt and do not call the API.
2. Update the icon and count immediately (optimistic), then send the request.
3. Replace the local count with `data.count` from the response. On any error, revert.
4. Like and save are idempotent, so retrying after a network failure is safe.

**Comments sheet.** Load `GET /videos/:id/comments` when it opens and page with `next_cursor`. After a successful post, insert the returned comment at the top and add one to the comment count. Render comments as plain text, never HTML.

**Report flow.** Show the reasons, with an optional note limited to 500 characters. After a `201`, show a thank-you and optionally hide that video locally for the session.

**Saved tab.** Use `GET /customer/me/saved-videos?page=n` and load more while `has_more` is true. Un-saving from this tab should remove the row at once.

**Video playback**

- Build the URL as `{BASE_URL}` + `video_url`. It is public: no auth header needed, and a standard player can stream it with Range requests.
- Files are MP4 or WebM, up to 25 MB, sent with a five-minute public cache header.
- If a file request returns `404`, the video was unpublished after you loaded the list; refresh the feed.

**Edge cases**

- A video can disappear between the feed call and an interaction. Treat `404 NOT_FOUND` on any action as "remove this card".
- Counts in a list can be slightly stale; refresh them from interaction responses, or call `GET /videos/:id` when opening from a notification or deep link.
- On a language change, re-fetch the feed with the new `Accept-Language`.
- Phone numbers are E.164 (`+965…`) and can go straight to the dialer.
