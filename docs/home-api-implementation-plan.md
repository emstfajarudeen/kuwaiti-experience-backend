# App home API implementation plan

Status: **implemented 21 October 2026** after the user's explicit Home-section approval. The [app API reference Home section](app-api-reference.md#12-home-screen), [Home OpenAPI](home-openapi.json), and [Postman collection](postman/kuwaitiexperience.postman_collection.json) are the current integration contract. This document records the original audit and implementation decisions.

Confirmed scope: reuse the existing venue records. Home Explore cards open **place details**, not videos. **Search stays pending. Cab and rental are excluded.** Notifications, bookings and the video feed remain separate sections. The existing Explore/category/detail APIs and this Home section are implemented.

## 1. Screen and existing-data audit

| Screen element                        | Existing source and CMS control                                                                                              | Required work                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero image and “Explore Kuwait” title | `home_content.hero_image_key`, `hero_title`; `/admin/home` has localized copy and hero upload/removal                        | Expose canonical HomeContent rows through v2 and image URLs through metadata. Keep the stored DB keys.                                                                                                                                      |
| Search bar                            | Existing `/api/v2/places` supports `q` within a required `type`                                                              | Pending by user decision. No cross-type search endpoint in this section.                                                                                                                                                                    |
| Notification bell/red dot             | No notification resource, unread count or CMS workflow                                                                       | Pending; do not fabricate an unread state or notification data.                                                                                                                                                                             |
| Book a Cab / Rent a Car               | Separate transport work                                                                                                      | Excluded by user instruction.                                                                                                                                                                                                               |
| “Explore Kuwait” wide tile            | Existing `/api/v2/explore` provides the category hub                                                                         | App navigates to that hub. For this version reuse the home hero artwork for the tile; a separate independently editable banner would require an additional owned-image field and is not assumed. The app owns this static navigation label. |
| Explore cards with short captions     | Existing Place identity, translations and cover images; no separate home Explore selection/caption controls                  | Add a small CMS-managed selection resource referencing existing places. Use the existing cover image and canonical Place; optional localized captions belong to the selection record. Taps open `/api/v2/places/:slug`.                     |
| Attractions carousel                  | `places.type = attraction`, non-null `featured_order`; title/address from `place_translations`, cover from `cover_image_key` | Reuse canonical Place serializer and add bounded featured composition.                                                                                                                                                                      |
| Dine In carousel                      | Same data with `type = restaurant`                                                                                           | Same implementation. Dine In is a UI label; keep `restaurant` in data.                                                                                                                                                                      |
| Stay carousel                         | Same data with `type = hotel_resort`                                                                                         | Same implementation. Keep `hotel_resort` in data.                                                                                                                                                                                           |
| Theaters carousel                     | Same data with `type = theater`                                                                                              | Same implementation; no movie/showtime aggregation needed on Home.                                                                                                                                                                          |
| Carousel arrows                       | Existing category listing APIs                                                                                               | Open `/api/v2/places?type=<code>`; Explore arrow opens the existing Explore hub. No extra “See All” resource.                                                                                                                               |
| Bottom navigation                     | App navigation; Explore and Profile APIs already exist                                                                       | No new API for a selected tab or navigation icon. Bookings stays with its own future section.                                                                                                                                               |

### Verified live data and differences

`GET /api/v1/home` currently returns a hero and **four featured venues in each of the four main types** (16 featured venues). It also returns two additional CMS types, `test1` and `qq`, with empty groups. These extra types should not automatically create Home sections for this screenshot. Do not delete them from the database or change the existing Explore hub to accomplish this.

Current featured examples include Kuwait Towers, Dar Hamad, Waldorf Astoria Kuwait and VOX Cinemas Kuwait. The selection/order differs from the screenshot: Dar Hamad and Waldorf are not currently first in their groups. Some other screenshot venues are not among the current featured picks; editorial selection must determine which records appear.

The inspected live response has `hero.image: null`, all category tile images null and all 16 featured covers null. Several descriptions explicitly say they are demo/sample content. These are content gaps: existing CMS upload/edit controls can supply approved images and copy. Do not populate images from the screenshot, reseed the database, or describe current sample copy as verified information.

The v1 home response uses aliases (`hero.title`, `discoveryTitle`, `categoryTypes`, nested `cover`) and shortened cards. Reusing it directly would violate the agreed v2 DB-key and entity-consistency rules. A live v2 attraction response confirms the canonical Place shape is already available, including nullable scalar fields and all four relation arrays.

The existing CMS offers a **Feature on homepage** checkbox but no numeric featured-order input. The writer retains an existing order or assigns `0` when newly featured; ties fall back to ID. Add explicit ordering so editors can choose the first card without changing place IDs.

## 2. Proposed data and contract

### Existing entities

- Reuse `app/serializers/explore.ts` for CategoryType and Place. Home, Explore, list, detail, saved and v2 admin Place objects must have identical keys, nesting, JSON types and nullability. Do not create a smaller Home Place DTO.
- Reuse `hydratePlaces` from `app/services/explore_read_service.ts` once for the union of selected Place IDs. Keep the existing `place_translations`, `place_hours`, `place_images`, `place_features`, image URL metadata and viewer `{ place_id, saved, open_now }` shape.
- Add one HomeContent serializer with every existing column: `locale`, `hero_eyebrow`, `hero_title`, `hero_image_key`, `discovery_title`, `app_title`, `app_body`, `updated_at`. Nullable columns remain present as null. Public and v2 admin reads/writes reuse this serializer. Do not substitute `hero_image_url` for `hero_image_key`.
- Return stored English/Arabic rows without rewriting their values. The client selects its locale and falls back per field to English, following Explore. No synthetic translation rows or renamed localized fields. An absent home configuration is an empty array, not an invented database record.
- CategoryType retains `code`, `name_en`, `name_ar`, `image_key`, `sort_order`, `updated_at`. The app can display Dine In/Stay as localized interface labels while data keeps `restaurant`/`hotel_resort`.

### New editorial selection resource

Proposed additive migration: `home_explore_cards` (finalize exact migration filename after inspecting current pending migrations).

| Column                     | Contract / constraint                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`                       | Positive integer primary key                                                                                         |
| `place_id`                 | Required FK to `places.id`, unique; restrict place deletion while referenced and explain how to remove the selection |
| `caption_en`               | Nullable string, maximum 200 characters                                                                              |
| `caption_ar`               | Nullable string, maximum 200 characters                                                                              |
| `sort_order`               | Required non-negative integer, default 0; bounded to 9999                                                            |
| `active`                   | Required boolean, default true                                                                                       |
| `created_at`, `updated_at` | UTC timestamps with millisecond precision; fixed ISO serialization                                                   |

Index `(active, sort_order, id)` for public selection. One shared HomeExploreCard serializer returns all these fields on public/admin reads and writes. Blank captions normalize to null. Display falls back from Arabic caption to English caption, then the place's localized title. Optional captions allow the screenshot's promotional wording without replacing the venue's actual title/summary globally.

A card owns no image: render the referenced place's cover via existing image metadata. Restrict selections to the four approved Home types. Admin may select a draft for preparation, but public reads require both an active card and a currently published referenced place. Archive/future publication hides the card publicly. Guard place type changes to an unsupported type while a Home selection exists; editors must remove/reassign it first. Enforce at most 50 configured cards to bound the read/editor workload. Do not insert screenshot selections in the migration.

`places.featured_order` already exists: add CMS/API editing, with `null` meaning not featured, `0` valid and lower numbers shown first. Omission preserves its value. No duplicate home-feature flag or featured-places table is needed. This is shared website/app ordering; do not introduce independent app ranking unless separately requested.

## 3. Proposed public API

**Implemented:** `GET /api/v2/home`, guest-accessible with the same optional customer bearer authentication used by Explore.

Proposed fixed response containers (protocol grouping keys are distinct from persisted entity properties):

```text
data.home_content        HomeContent[] — actual stored rows, ordered by locale
data.category_types      CategoryType[] — the four configured Home types
data.home_explore_cards  HomeExploreCard[] — visible selections in editorial order
data.places              Place[] — unique union of carousel and Explore-card venues
meta.home_sections       { type, place_ids, has_more }[]
meta.viewer              { place_id, saved, open_now }[]
meta.images              { storage_key, url }[]
meta.evaluated_at        ISO UTC string
```

Freeze these container names and reference existing OpenAPI entity schemas before coding. Arrays and keys are always present, even when empty. `has_more` is a boolean. `place_ids` contains integers referring to canonical entities in `data.places`; it preserves display order. Metadata contains derived grouping, URLs and viewer state; persisted entity objects keep exact DB columns.

Composition rules:

1. The four Home types are `attraction`, `restaurant`, `hotel_resort`, `theater`, ordered by their existing `category_types.sort_order`, then `code`. Return only matching existing CategoryType rows. Arbitrary additional CMS types remain available through their existing APIs but do not automatically appear on this Home screen. If a required type has been deleted, omit its descriptor rather than synthesizing an entity.
2. Each section selects published places with `published_at <= evaluated_at` and `featured_order IS NOT NULL`, ordered by `featured_order`, then `id`. Default/fixed cap: **8 per type**. Fetch one extra eligible row per type to compute `has_more` before discarding it. This flag concerns additional featured picks; See All uses the existing full category listing, which can include other published venues.
3. Home Explore cards: active, eligible selections, ordered by `sort_order`, then `id`, capped at **8**. Load their places even when those places are not featured. A place may occur in multiple sections/cards but appears once in `data.places` and once in viewer metadata. Keep configured hidden/unpublished cards visible only to authorized editors.
4. A section with no eligible featured venues has `place_ids: []` and `has_more: false`; the app hides that empty carousel. Do not silently fill it with non-featured venues. No home-level pagination/query limit is necessary for this bounded composition; full browsing already has pagination.
5. Use a single evaluation timestamp across visibility/Open Now metadata. Guest viewer state is `saved: false`. Supplied invalid/expired/customer-inappropriate tokens follow existing Explore errors; never silently treat invalid credentials as a guest.
6. Set `Cache-Control: no-store`, consistent with existing personalized Explore reads. Do not share cache customer bookmarks. Do not add `notification_count`, a fake red-dot flag, transport actions or search results to this response.
7. Combine the existing hero, CategoryType and Place keys into deduplicated `meta.images`; use existing publication-aware image delivery. Missing image keys stay null and use app placeholders. Keep authenticated previews separate.
8. The wide Explore tile and Explore heading arrow navigate to the existing hub. Explore cards and venue cards navigate by canonical place slug; category arrows use the unchanged DB type code. Static UI labels/search placeholder/icons need no new persisted fields.

No cross-category search, notification, booking, cab, rental or video endpoints are added in this section. A new Home endpoint must not break the website's existing `/api/v1/home` contract.

## 4. Matching CMS and admin API work

### Home editor

Extend `/admin/home` to show the existing hero/copy editor, selected Explore cards, a venue picker, optional English/Arabic captions, active state and numeric order. Offer remove/reassign and preview through existing authenticated image routes. Avoid duplicate image uploads for cards.

Use DB field names in the updated Home form and v2 validator (`hero_title`, `hero_eyebrow`, `discovery_title`, captions, etc.). Browser writes retain signed sessions, CSRF, redirects and flash errors. Legacy v1 adapters may map old request keys into the shared write service to preserve existing consumers; the new v2/CMS contract uses DB names.

### Featured places

Expose `featured_order` as a nullable numeric input beside the existing featured selection, and explain lower-first ordering. Keep checkbox compatibility where necessary but reject contradictory submissions instead of silently choosing an interpretation. A dedicated v2 update accepts `{ featured_order: number | null }` and returns the existing complete canonical Place. Reuse the audited transactional write pattern; do not require an image re-upload or change publication status merely to rank an existing record.

### Implemented endpoint map

| Method/path                                               | Behavior                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v2/admin/home?locale=en`                        | HomeContent row or null, using the shared serializer; image preview URLs in metadata                                  |
| `PATCH /api/v2/admin/home`                                | Validated DB-key localized copy, including `locale`; return the complete stored HomeContent row                       |
| `PUT /api/v2/admin/home/hero-image?locale=en`             | Existing owned-image pipeline, multipart `file`; canonical row response                                               |
| `DELETE /api/v2/admin/home/hero-image?locale=en`          | Remove hero through existing service; 204                                                                             |
| `GET /api/v2/admin/home-explore-cards?page=1&per_page=20` | Canonical selection rows, paginated, including inactive/preparation cards                                             |
| `POST /api/v2/admin/home-explore-cards`                   | Create selection with required `place_id`, `sort_order`, `active`; optional nullable captions; 201 with canonical row |
| `GET /api/v2/admin/home-explore-cards/:id`                | Read one canonical selection and its referenced complete Place                                                        |
| `PUT /api/v2/admin/home-explore-cards/:id`                | Update complete selection inputs and return canonical row                                                             |
| `DELETE /api/v2/admin/home-explore-cards/:id`             | Remove selection only; retain venue and cover; 204                                                                    |
| `PATCH /api/v2/admin/places/:id/featured`                 | Update nullable `featured_order`; return canonical Place                                                              |

The existing authenticated `/api/v2/admin/places` list can power the picker; do not add an unbounded duplicate venue lookup. Related Place records in an admin card preview must also use the full canonical serializer, with admin image URLs in separate metadata. Admin pagination follows existing `page`, `per_page`, `total`, `last_page`.

Existing category-type CMS controls already manage localized names, tile images and type order. Home reads must reuse the canonical category-type serializer. If new Home-related JSON/editor code uses type reads/writes, add matching v2 type adapters with exact DB keys instead of calling legacy `image_url`/camelCase contracts; do not silently change the website's v1 routes. A separate app-only category-title system is unnecessary for this scope.

## 5. Implementation sequence within the Home section

The Home section was approved and implemented. Search, notifications and transport retain their separate approval boundaries.

1. **Freeze schemas and navigation.** Reuse the released Place/CategoryType schemas; define HomeContent, HomeExploreCard and HomeResponse. Carry the confirmed place-detail card target and pending search decision into the API guide. Verify the actual current columns before defining the new migration.
2. **Add the selection schema and shared writers.** Create only `home_explore_cards` and its constraints/index. Add canonical serializers, audited transactional CRUD and place deletion/type-change protections. Before applying a required migration, report its name and exact target DB. Preserve all existing records; no reset/reseed/rollback/media conversion is required for Home.
3. **Implement bounded Home composition.** Add a thin Home controller and service; reuse optional customer auth, `hydratePlaces` and image helpers. Select capped rows per type using a bounded partition query or four small bounded queries, then hydrate the combined unique ID set once. Do not query relations per card or run one hydration pass per carousel. Load visible selections with SQL joins so hidden places do not consume the public cap.
4. **Implement matching admin/CMS controls.** Add the endpoint map, localized Home form with DB-key inputs, card selection/captions/order/active state, and featured ordering. Reuse private upload validation, preview and old-file cleanup for hero changes; a new image owner is unnecessary for place-linked cards.
5. **Document integration alongside implementation.** Extend `docs/app-api-reference.md` with the Home contract and exact OpenAPI schemas/references; extend the existing Postman collection/environment with guest/authenticated Home, CMS copy/hero, card CRUD and featured-order requests. Use existing variables/token capture. Mark planned paths as implemented only after verification.
6. **Verify and hand off.** Use `kuwaitiexperience_test` and `storage/test-uploads` for tests, then read-only checks against existing dev content. Record content gaps separately from code failures. Run required typecheck/lint/functional/build checks for the final implementation, preserving unrelated work in this shared checkout.

## 6. Acceptance and security/performance checks

- Hero, Explore tile, selected place-linked Explore cards and all four carousels render from documented data; every card tap resolves an existing eligible place and every arrow uses the correct existing destination.
- Identical Place key sets/types/nullability across Home, listing, detail, saved and admin. HomeContent/Card public/admin responses share their serializers. No UI-friendly aliases for stored columns.
- CMS can select/unselect/order featured venues, configure captioned cards, edit localized hero copy and upload/remove the hero. Updates appear in Home; duplicate selections, unknown/wrong-type places and invalid ranks fail consistently.
- Archived/draft/future places remain hidden in carousels and cards; missing covers/copy are explicit null/empty data. Deletion/type-change guards explain referenced selections. No screenshot/demo content is inserted automatically.
- Guest, valid customer, expired token and another customer's bookmarks retain existing authentication/ownership behavior. CMS APIs require admin bearer credentials, browser forms require CSRF, and all editorial mutations produce audit records.
- Stable ordering including ties/zero ranks, 8-item caps, empty groups, overlapping selections, Arabic field fallback, unchanged money/timestamp types, one evaluation time and Open Now parity.
- Query work is bounded; translations/hours/images/features/bookmarks batch-load once for the unique Home places. Inspect the complete canonical payload size rather than dropping Place keys to shrink a card. Use existing image limits and page/input length bounds, with no arbitrary URL/file references.
- Standard `ApiError` envelope/status behavior; paginate admin card reads and validate IDs/foreign keys/lengths. Guard the max-card and uniqueness limits transactionally, including concurrent writes, returning a stable conflict response.
- Regression coverage for existing website Home and publication-aware image delivery; Postman examples match actual responses and reference shared entity schemas.

## 7. Approval and pending items

**Approved and implemented:** one Home section covering `GET /api/v2/home`, the small place-linked Explore selection resource, canonical Home CMS APIs/forms and featured-order editing, with documentation/Postman.

**Confirmed pending/excluded:** home search (user decision), notifications/unread state (no supplied behavior), rental, cab, bookings and the video/social section. The user explicitly confirmed these Home Explore cards open place details.

**Editorial inputs:** reattach approved images, review demo copy, choose/order the actual venues, supply optional card captions/Arabic text. Existing records can be reused immediately; exact screenshot artwork, copy and selections are not established merely because a similarly named venue exists.
