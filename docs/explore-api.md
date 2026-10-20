# Explore API and CMS integration

Base: `/api/v2`. Exact schemas: [explore-openapi.json](explore-openapi.json), also referenced by [openapi.yaml](openapi.yaml). The website's v1 contracts remain available. Explore v2 uses the same place, category, translation and image records, with one canonical Place serializer across public lists/details, saved lists and v2 admin reads/updates.

Implemented additions: place bookmarks, venue phones, highlights/amenities/capabilities, stay check-in/out, theater screen counts, CMS-maintained movies/posters/showtimes, and computed Open Now. Schedule remains pending. These APIs do not create cab rides, hotel reservations or cinema ticket bookings.

## Browse

| Request                                                       | Behavior                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /explore`                                                | `{ data: { category_types: [...] }, meta: { images: [...] } }`. Ordered type records use literal DB keys `code`, `name_en`, `name_ar`, `image_key`, `sort_order`, `updated_at`. |
| `GET /categories?type=attraction`                             | Active Category entities including full `category_translations` rows.                                                                                                           |
| `GET /place-features?type=theater`                            | Active Feature entities, with `code`, `kind`, `name_en`, `name_ar`, `type`, etc.                                                                                                |
| `GET /places?type=attraction&category=all&page=1&per_page=12` | Published places and filtered pagination.                                                                                                                                       |
| `GET /places/:slug`                                           | One published Place, in precisely the same shape as a list element.                                                                                                             |
| `GET /places/:slug/showtimes?date=2026-10-21`                 | Upcoming published sessions for the selected theater and Kuwait calendar date, with related movie records.                                                                      |

Types are CMS-managed codes; defaults are `attraction`, `restaurant`, `hotel_resort`, `theater`. Do not rename these to UI labels such as Dine In or Stay. `type` is required for public place/category/feature lists; saved and admin place lists may omit it.

Place-list filters: optional `category` slug, `feature` code, `q` (maximum 80 characters), `open_now=true|false`. Filters combine with AND. Omit category or use `all` for all published places, including uncategorized ones. Feature filtering selects assigned active definitions of the matching type. Unknown category/feature codes produce an empty list. Search matches stored English/Arabic title or summary, with SQL wildcard characters escaped. `open_now=false` disables the open-only restriction; it does not mean “closed only.” Page defaults to 1, `per_page` to 12, maximum 50; page is capped at 10000. Counts are filtered before pagination. Sorting uses featured order then ID; saved lists use newest save then place ID.

### Canonical Place

Every returned Place has all of these keys:

```text
id, type, category_id, slug, status, cover_image_key,
latitude, longitude, price_amount, price_currency, price_mode, website_url,
featured_order, phone_e164, check_in_time, check_out_time, screen_count,
published_at, created_at, updated_at,
place_translations, place_hours, place_images, place_features
```

These are DB column names and table-named relation containers. Scalars that have no value are present as `null`; collections are always arrays. There are no `cover`, `hoursNote`, `price.amount` or localized `name` aliases. Relations are batch-loaded per page, including the bounded gallery, rather than queried separately for each card.

IDs/counts are integers; flags are booleans; coordinates are numbers or null; `price_amount` is a string such as `"95.000"` or null. Keep `price_currency`, `price_mode` and translated `price_unit` when displaying prices. These are CMS-entered prices, not live inventory or currency conversion. Timestamps are ISO UTC; wall-clock fields are `HH:mm:ss` in Kuwait local time.

All stored translation rows are returned, retaining `locale` and DB field names. The app selects its locale and falls back **per field** to English for missing/null/empty Arabic content. `locale` need not be sent to these v2 discovery endpoints because their entity data is locale-independent. No extra Arabic translation row is fabricated. `name_en`/`name_ar` and movie title/synopsis pairs follow the same client fallback rule.

List/detail metadata includes:

```json
{
  "viewer": [{ "place_id": 12, "saved": false, "open_now": null }],
  "images": [
    { "storage_key": "<owned-image-key>.webp", "url": "/api/v1/images/<owned-image-key>.webp" }
  ],
  "evaluated_at": "2026-10-20T07:00:00.000Z"
}
```

Lists additionally have `page`, `per_page`, `total`, `last_page`. Image URLs are derived protocol data, not aliases replacing DB keys. Join relative URLs to the API origin. Admin metadata uses authenticated image routes. Canonical entity fields remain identical.

Browse as a guest without Authorization; send a customer access bearer token to receive that customer's save state. Invalid supplied tokens are rejected. Guests receive `saved: false`. v2 responses use `Cache-Control: no-store`, including personalized and time-dependent results.

### Open Now

Calculated from `place_hours` in `Asia/Kuwait`. Weekday 0 is Sunday. Intervals are opening-inclusive, closing-exclusive; split hours, overnight intervals and Saturday-to-Sunday spill are supported. Previous-day overnight hours can keep a place open after midnight. Closed rows explicitly declare no opening interval for their day. Missing hours for the current day return `open_now: null` unless an overnight interval is currently open. Hours notes and stay check-in/out times do not establish opening hours. Holiday/special-date overrides are not implemented.

The open-only SQL filter and returned state use the same request timestamp and interval rules before count/pagination. CMS/API writes reject duplicate slots, overlapping intervals, contradictory closures and backward times without overnight marking. A 24-hour day is `00:00` to `00:00` with `closes_next_day: true`.

## Bookmarks

Customer bearer authentication is required:

- `PUT /customer/me/saved-places/:place_id`: returns HTTP 200 with `{ data: { customer_id, place_id, created_at } }`. Idempotent; repeats retain the original save timestamp. The place must be published and visible.
- `GET /customer/me/saved-places?type=restaurant&page=1&per_page=12`: returns the same canonical Places and viewer metadata as browsing; hidden/deleted places do not appear or affect totals.
- `DELETE /customer/me/saved-places/:place_id`: returns HTTP 204, also if this account never saved it. Does not affect another account's save.

The unique customer/place key prevents duplicates. No customer ID is accepted from the app. Writes are limited to 120 per customer per minute. Customer deletion cascades saves; place deletion also removes associated saves. Guest bookmarks and saved videos/addresses are outside this section.

## Manage place details in the CMS

Open **Places → Edit → Manage Explore details, features and opening hours** at `/admin/places/:id/explore`.

- Venue phone: international `phone_e164`; blank hides the Call action. Native dialing is app behavior and needs no call endpoint.
- Stay: nullable `check_in_time` and `check_out_time`, shown only for `hotel_resort`.
- Theater: nullable integer `screen_count` (1–1000), shown only for `theater`; link to manage sessions.
- Features: checkboxes for definitions belonging to this place type; maximum 50 assignments. Inactive definitions remain manageable but are hidden publicly.
- Weekly hours: choose a day per row, interval order, opening/closing time, next-day and closed flags. Unused rows are ignored. Remove all rows for a day to make it unknown; use one Closed row to mark it closed. Up to 70 intervals are supported; the editor keeps existing rows and offers spare rows on subsequent saves.

Existing place text, price, cover and gallery editors remain available. A place's type cannot change while it has feature assignments, stay/theater-specific values or showtimes; clear those first. New Explore fields use exact DB names in CMS form payloads and v2 JSON APIs.

Matching admin bearer endpoints:

| Request                                      | Behavior                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/places`, `GET /admin/places/:id` | Canonical Place entities, including drafts for authorized admins.                                                                         |
| `PATCH /admin/places/:id/explore`            | Partial update of `phone_e164`, `check_in_time`, `check_out_time`, `screen_count`, `feature_ids`, `place_hours`; returns canonical Place. |

Omitted fields stay unchanged; scalar null clears a value; `feature_ids: []` unassigns all features; `place_hours: []` clears hours. `feature_ids` is a relationship-update instruction, not a renamed persisted response attribute. Example:

```json
{
  "phone_e164": "+96590987788",
  "feature_ids": [3, 7],
  "place_hours": [
    {
      "weekday": 1,
      "interval_index": 0,
      "opens_at": "09:00",
      "closes_at": "22:00",
      "closes_next_day": false,
      "closed": false
    }
  ]
}
```

## Manage features

Sidebar **Place features** (`/admin/place-features`) supports add/edit/delete, English/Arabic labels, type, code, display order, visibility and `kind`: `highlight`, `amenity`, `capability`. Codes are lowercase hyphenated identifiers such as `sea-view` or `imax`; unique per type. Open Now is computed, not an editable feature. Up to 500 definitions per type are allowed; public lists filter to one type. Admin feature reads return at most 1000 records; use their `type` filter for a larger multi-type library.

Admin bearer API: `GET/POST /admin/place-features`, `PUT/DELETE /admin/place-features/:id`. GET accepts optional `type`. POST returns 201; PUT returns 200; both return the same Feature schema. Assigned definitions cannot be deleted or moved to another type (409 `FEATURE_IN_USE`); hide or unassign them first. Feature writes/deletes are audited.

## Manage movies and showtimes

Sidebar **Movies** (`/admin/movies`) provides paginated lists, add/edit/delete, English/Arabic titles/synopses, optional duration/age rating, owned poster upload/replacement/removal and draft/published/archived state. A poster is required to publish. JPEG/PNG/WebP uploads use the existing 5 MB/pixel-bounded image pipeline. Draft/archive posters require admin auth; published movie posters use the publication-aware public image route. Replacement/deletion cleans up the released file; orphan/reference checks include movie posters.

Sidebar **Showtimes** (`/admin/showtimes`) provides paginated sessions and add/edit/delete/cancel, choosing a theater, movie, date/time, format and state. **The form uses Kuwait time**, converts it to UTC for storage, and preserves the offset when editing. Draft sessions can reference draft records; publishing requires published theater and movie records. A duplicate venue/movie/start/format is rejected. Movie deletion is blocked while sessions reference it; archive the movie or remove sessions first.

| Admin bearer endpoint              | Behavior                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `GET/POST /admin/movies`           | Paginated list / create draft. POST returns 201 with canonical Movie.    |
| `GET/PUT/DELETE /admin/movies/:id` | Read / replace text and status / delete if unreferenced.                 |
| `PUT /admin/movies/:id/poster`     | Multipart field `file`, returns canonical Movie.                         |
| `DELETE /admin/movies/:id/poster`  | Clears poster on a draft/archive; published movies must retain a poster. |
| `GET/POST /admin/showtimes`        | Paginated list (optional `place_id`) / create session.                   |
| `PUT/DELETE /admin/showtimes/:id`  | Replace/cancel session / delete session.                                 |

Movie POST/PUT fields: required `title_en`, `status`; optional nullable `title_ar`, `synopsis_en`, `synopsis_ar`, `duration_minutes` (1–600), `age_rating`. PUT replaces these editable fields; omit optional values to clear them. Upload/create a draft, attach the poster, then publish. Status is `draft`, `published` or `archived`.

Showtime POST/PUT fields: `place_id`, `movie_id`, `starts_at` (ISO timestamp **with timezone**, for example `2026-10-21T19:30:00+03:00`), `format` and `status` (`draft`, `published`, `cancelled`). PUT replaces these fields. Every Movie and Showtime response uses the exact same serializer in list, detail, writes and public included resources.

Public showtime reads default to today's Kuwait date, exclude already started sessions, cancelled/draft sessions, hidden venues and unpublished/future-published movies. Any valid requested calendar date is accepted; past dates produce no upcoming sessions. The response has `{ data: <Showtime[]>, included: { movies: <Movie[]> }, meta: { images, date, timezone, page, per_page, total, last_page } }`. Group sessions by `movie_id` to build Active Movies. Pagination is over showtimes, so the same movie may appear on more than one page. No current sessions means empty arrays; movie/program ownership is manual in the CMS, not a cinema feed.

## Errors, migration and scope

Errors retain `{ error: { code, message, requestId, fields? } }`. Common domain codes: `INVALID_HOURS`, `INVALID_PLACE_DETAILS`, `INVALID_FEATURE`, `INVALID_FILTER`, `INVALID_PAGINATION`, `INVALID_DATE`, `INVALID_TIME`, `INVALID_SHOWTIME`, `EMPTY_UPDATE`, `FEATURE_EXISTS`, `FEATURE_IN_USE`, `FEATURE_LIMIT`, `MOVIE_IN_USE`, `SHOWTIME_EXISTS`, `POSTER_REQUIRED`, `PLACE_TYPE_IN_USE`. Unknown/hidden resources return 404. Admin writes are transactional/audited; CMS forms use authenticated cookies and CSRF; APIs require bearer credentials.

Migration `1760000000009_add_explore_content` adds four nullable place columns plus `place_features`, `place_feature_assignments`, `customer_saved_places`, `movies`, `theater_showtimes`. New timestamps retain millisecond precision so immediate publication reads do not race rounded future timestamps. Existing place content is preserved; no new venue, hours, rate, feature or movie content is seeded. The schema requires the entity-owned image migration `1760000000008_replace_media_with_entity_images` to be handled first. That earlier migration removes old media links and is a separate deployment decision; do not blindly run all pending migrations on existing content.

CMS bookmarks are not editorial data: admins manage the places that can be saved, while customers own their saves. No general CMS browsing/editing of private customer bookmarks is added. Book a Cab remains the previously agreed future native-flow destination handoff; actual ride APIs and Schedule are not implemented here. Share uses the app's eventual public/deep-link configuration.

## Verification and local activation status

Verified 20 October 2026: `node ace test` passed **48 tests**, including canonical public/CMS/saved Place parity, account ownership/deletion, Open Now boundaries/filters, Arabic search, movie posters/publication/showtimes and real CMS multipart/CSRF form submissions. Type checking, lint and production build passed. The Postman collection contains 59 requests covering all 51 documented customer and Explore operations; variables, JSON bodies, script syntax and OpenAPI references were checked.

Local activation completed on 20 October 2026 after the user explicitly approved the backup and `node ace migration:run` against `kuwaitiexperience_dev`. Migrations **0008 and 0009 are applied**; the database records all 10 migrations. Database schema classes were regenerated and type checking passed afterward. The 24 existing places, admin account and other non-media row counts were preserved. Legacy media rows/links were removed as approved; reattach place/tile/home/logo images through the CMS. New feature/movie/showtime/save tables start empty and require actual editorial/customer input.

Verified backup: `tmp/backups/kuwaitiexperience-dev-2026-10-20T07-49-03-938Z/` contains `database.sql`, `uploads.tar.gz`, SHA-256/counts in `manifest.json`, plus activation and HTTP check reports. Every pre-migration table definition and SQL completion footer was checked, and the archived upload matches the source byte for byte. Backup files are private and excluded from Git under `tmp/`.

The local server at `http://127.0.0.1:3333` passed **45 read-only HTTP checks**, including canonical list/detail parity for nine existing places across populated types, categories/features, Open Now, theater showtime reads, customer/admin API guards and CMS login redirects. This is local development activation; no production database was changed.
