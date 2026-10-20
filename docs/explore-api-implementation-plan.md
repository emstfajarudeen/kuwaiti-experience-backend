# Explore APIs — audit and implementation handoff

Status update: **the user subsequently approved the requested Explore additions and matching CMS management**. They are implemented in the [Explore API guide](explore-api.md), with the actual contract in [explore-openapi.json](explore-openapi.json). The proposal below is retained as audit/design history; where choices differ (for example, nullable stay/theater columns on `places` instead of separate one-to-one tables), the implemented guide/schema takes precedence. Schedule and actual cab booking remain outside the approved work.

Confirmed user decisions: **CMS-managed theater movies/showtimes**, **Schedule pending**, and **Book a Cab opens the future native cab flow with the selected place as its destination**. The subsequent implementation request approved the specified new data/API/CMS capabilities; it did not approve implementing cab rides or Schedule.

## 1. Scope and verification

The screenshots show nine screens: Explore hub, Attractions list/detail, Dine In list/detail, Stay list/detail and Theatres list/detail. Visible controls include category/feature chips, bookmarks, sharing, Call and Book a Cab. The Explore hub also has a Schedule tile, but no destination screen was supplied.

Reviewed implementation authorities:

- `start/routes.ts` and `app/controllers/api/public_controller.ts` — current website endpoints and validation.
- `app/services/public_content_service.ts` — actual public list/detail/home responses and queries.
- `app/services/category_type_service.ts` — type tiles, labels and ordering.
- `database/migrations/1760000000002_create_content_tables.ts`, `1760000000004_create_category_types.ts`, `1760000000005_link_category_types.ts` — original place/category/hour/translation schema.
- `database/migrations/1760000000008_replace_media_with_entity_images.ts`, `app/services/image_storage_service.ts`, `app/services/image_reference_service.ts` — entity-owned image change (since completed).
- `app/validators/content.ts`, `app/services/content_write_service.ts`, admin place controller and CMS place editor — existing editorial write capabilities.
- Existing customer authentication, serializers, functional tests and API documents.

**Verification limit:** read-only HTTP verification was attempted at `127.0.0.1:3333`; connection was refused because the backend was not running. Findings below are verified against source and migration definitions, not live response bodies, deployed schema or editorial record completeness. No migrations, seeds, DB resets or application code changes were performed for this plan. Screenshot venue names, fees, hours and movie titles have not been verified as real/current content.

### Existing image-work dependency

The working tree contains an image migration replacing shared media IDs with entity-owned keys, including `places.cover_image_key`, `category_types.image_key` and `place_images.storage_key`. Update: that change is now complete. Place, category-type, home and site reads use the new keys and emit `/api/v1/images/{key}`; the shared media routes and tables are removed, and the documentation was updated to match. Check the migration status of the target database before treating the existing discovery APIs as a working baseline. Do not duplicate, overwrite or blindly apply this migration; its removal of old media links is destructive to that image data.

## 2. What can be reused from the website

| Current endpoint                                                            | Existing behavior                                                                                                    | App use / gap                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/home?locale=en`                                                | Hero, type tiles, featured place groups; no standalone public type endpoint                                          | Reuse type records/ordering/images for Explore. Add a lean v2 Explore response rather than fetching all website home content.    |
| `GET /api/v1/categories?type=...&locale=en`                                 | Active categories for a type, localized name                                                                         | Existing foundation for chips. Does not express overlapping attributes or Open Now.                                              |
| `GET /api/v1/places?type=...&category=...&page=1&perPage=12&locale=en`      | Published lists, category filter, English title/summary search, bounded pagination, featured ordering                | Reuse records and visibility rules. Cards omit prices, hours, theater facts and customer save state.                             |
| `GET /api/v1/places/:slug?locale=en`                                        | Card fields plus body, hours note, weekly intervals, price, coordinates, gallery, SEO and cab-destination descriptor | Much of the Attractions detail exists; restaurant/stay/theater extensions and phone contact are missing.                         |
| `GET /api/v1/images/:key`                                                   | Publication-aware public image bytes in the new image implementation                                                 | Reuse image delivery once the migration/service transition is verified.                                                          |
| `GET /api/v1/transport/locations` and `POST /api/v1/transport/enquiry-link` | Active predefined locations and WhatsApp enquiry URL                                                                 | Does not book a cab. A place ID is not a transport-location ID, and arbitrary place destinations are not supported by this flow. |

Existing type defaults are `attraction`, `restaurant`, `hotel_resort`, `theater`. “Dine In” and “Stay” are UI labels for existing type records, not reasons to rename their codes. Types are CMS managed; read actual records rather than hardcoding four allowable codes.

**Conclusion:** the app and website share the same place/category content foundation. These screens need additional structured data and actions; they cannot be fully served by the current website responses unchanged.

## 3. Screen-by-screen differences

| Screen / element                           | Already stored or supported                                             | Additional work                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explore tiles                              | Type code, English/Arabic names, sort order, image ownership            | Stable DB-key v2 type serializer and hub response; reconcile image changes. Schedule remains undefined.                                              |
| Attractions chips                          | Category records and active filtering                                   | Confirm CMS categories for shown labels; do not seed screenshot labels automatically.                                                                |
| Place card image/title/summary/address     | Place cover and translation rows                                        | Canonical relation structure/types, image references and bookmark state outside the Place entity.                                                    |
| Attraction opening hours                   | Weekly intervals plus `hours_note`                                      | Correct Kuwait-time derivation and unknown-hours behavior. Keep raw hours fields for both list and detail.                                           |
| Attraction entry fee                       | `price_mode`, `price_amount`, `price_currency`, translated `price_unit` | Existing data is suitable. Keep amount as a three-decimal string. USD conversion in a mock is not a supported rate source.                           |
| Dine In cuisine chips                      | Single primary `category_id` per place                                  | Single categories work for exclusive classification. Overlapping feature chips need structured features and explicit filter semantics.               |
| Dining highlights                          | No structured highlights                                                | CMS-managed, localized features such as Sea View and Family Friendly; do not parse the description into tags.                                        |
| Stay card nightly amount                   | Price columns exist, but v1 list does not return them                   | Return the same price columns on every Place object; keep the rate unit translated. Rates are editorial starting prices, not availability/quotes.    |
| Stay check-in/check-out                    | No structured fields                                                    | Add nullable structured check-in/out times and CMS inputs. These are not business opening hours.                                                     |
| Stay highlights                            | No structured highlights                                                | Reuse the localized feature system for Private Beach, Spa, Family Pool, etc.                                                                         |
| Theater chips                              | Type/category infrastructure only                                       | IMAX/VIP are capabilities; Open Now is a derived time filter. Do not represent Open Now as a static category.                                        |
| Theater screen count / formats / amenities | No structured fields                                                    | Theater profile fields and localized capabilities/amenities. Summary text alone is insufficient for filtering.                                       |
| Theater ticket range                       | One existing amount supports a starting price                           | Keep `price_amount` as minimum/from price where applicable; add a nullable maximum only if an actual range is required. No ticket checkout is shown. |
| Active movies                              | No movies, venue screenings or showtimes                                | Movie metadata/posters, venue associations, dated showtimes, presentation format and editorial/provider ownership.                                   |
| Photo gallery                              | Entity-owned image records and ordering in current image work           | Reuse cover/gallery storage, alt/caption fields and publication-aware delivery; no second media library.                                             |
| Bookmark on cards/detail                   | Customer auth exists; saved-place table/routes do not                   | Customer-owned save/unsave/list, unique ownership constraint, guest behavior and consistent state across screens.                                    |
| Call                                       | No place phone column; site WhatsApp is unrelated                       | Nullable venue `phone_e164`, validation and CMS input. App opens native dialer; no call-initiation API is needed.                                    |
| Share                                      | Slug and optional external `website_url` exist                          | Native share is app behavior. Agree on a routable public/deep link; do not assume a venue website is an app detail link.                             |
| Book a Cab                                 | Coordinates and a legacy cab descriptor exist                           | Pass place ID/coordinates to the agreed cab destination flow; do not claim a booking or substitute WhatsApp silently.                                |

## 4. Required contract rules

### Canonical entities

1. Reuse the same DB records for the website, app and CMS. Introduce v2 discovery endpoints so app integration can adopt the required contract without silently changing legacy v1 response keys.
2. A persisted property must use its actual column name: `code`, `sort_order`, `category_id`, `cover_image_key`, `price_amount`, `price_currency`, `price_mode`, `hours_note`, etc. No `type` alias for `category_types.code`, `order` alias for `sort_order`, `hoursNote`, nested renamed `price.amount`, or `category` alias for a foreign key.
3. Use full translation rows in relations such as `place_translations` and `category_translations`, with DB field spellings. Retain English and Arabic values; expose selected locale/fallback information as response metadata, not renamed persisted fields. The app selects localized values with documented per-field English fallback.
4. Define **one fixed Place shape**, shared across v2 list, detail, saved lists, future featured/home results and v2 admin/CMS reads. Its scalar keys and bounded relation containers must be present consistently. Do not reuse the Place type for a shorter card projection. Include the same bounded `place_translations`, `place_hours`, `place_images`, features and nullable type-specific profile relations on all of these endpoints. Batch their queries to avoid one query per card.
5. Public reads expose published content only. Draft/archived visibility is an authorization/query concern; a draft returned by a permitted admin read still uses the same public-safe Place shape. Keep private audit/internal data in separate admin resources rather than conditionally adding fields to Place.
6. Nullable scalar/profile values are explicit `null`; missing collections are `[]`. Boolean fields are booleans, IDs/counts integers, money three-decimal strings, timestamps UTC ISO strings. Local wall-clock times are documented separately; coordinates have one consistent numeric/null representation.
7. Movie/showtime collections can grow: expose them through their own paginated resources rather than embedding an unbounded movie schedule in every Place. Every Movie and Showtime must have its own canonical shape wherever reused.
8. Derived values belong in documented protocol metadata/action containers outside persisted entities. Examples: image delivery URLs keyed by their storage keys, selected locale, `open_now`, native share target and cab destination. Every such container has fixed keys and nullability.
9. Personal bookmark state belongs in separate viewer metadata keyed by place ID, with the same `{ place_id, saved }` shape for guest and signed-in responses. Guests have `saved: false`; save writes require customer authentication. Invalid supplied tokens return 401. Do not put a computed `is_saved` field into Place unless it is deliberately added as a persisted column, which is not recommended.
10. In v2 protocol metadata use `page`, `per_page`, `total`, `last_page`; persisted key rules also apply to CMS validators and request payloads. New CMS fields must not introduce camelCase request aliases.

### Reuse boundaries and audit findings

The current v1 card has `category`, `title`, `summary`, `address`, `cover`; detail adds `hoursNote`, nested `price`, `coordinates`, `hours`, `gallery`, `seo`, `cabDestination`. Admin list/show/write shapes also differ. Reusing these responses directly would violate the user's consistency requirement. Create shared serializers and v2 CMS endpoints, then adapt browser CMS reads/writes for this section to those DB-key contracts. Preserve existing v1 consumers until an explicit migration is agreed.

Current detail localization selects an entire Arabic translation when present, while some card fields use per-field English fallback. Current search matches English only. V2 must document and test per-field fallback and the intended English/Arabic search behavior consistently.

## 5. Proposed data additions

These names are **migration proposals, not existing fields or a released API**. Finalize SQL columns and schemas together in E1, then use those exact names everywhere.

| Storage                                                                     | Proposed purpose                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `places.phone_e164` nullable                                                | Venue call contact; independent of site/support contact.                                                                                                                  |
| `place_stay_details` keyed uniquely by `place_id`                           | Nullable `check_in_time`, `check_out_time`; shared relation is null for other place types.                                                                                |
| `place_theater_details` keyed uniquely by `place_id`                        | Nullable `screen_count`; future ticket maximum field only if needed.                                                                                                      |
| `place_features`, `place_feature_translations`, `place_feature_assignments` | CMS-managed codes, labels, applicable types and explicit kinds such as capability/highlight/amenity; unique place/feature assignment. Retain existing primary categories. |
| `customer_saved_places`                                                     | `customer_id`, `place_id`, `created_at`, unique customer/place and list index; customer deletion cascades.                                                                |
| `movies` and `movie_translations`                                           | Movie identity, publication lifecycle, licensed poster key, localized title/synopsis, nullable duration/certification if content owner supplies them.                     |
| `theater_showtimes`                                                         | Theater `place_id`, `movie_id`, `starts_at` UTC, nullable `ends_at`, presentation format/capability, publication/cancellation state; indexed by venue/date.               |

Reuse `place_images` and entity-owned image services. Any new movie-poster owner must be added to reference checks, publication checks, deletion and orphan cleanup. Do not point movie posters at private customer profile images. Reuse `place_hours` for open-now calculation; no duplicate schedule text table.

For Open Now, evaluate intervals in `Asia/Kuwait`, including previous-day overnight intervals, multiple intervals and explicit closures. Missing hours means `open_now: null`, not false. `open_now=true` excludes unknown/closed places. Check-in times and text-only hours notes never imply that a venue is open. Special holiday hours remain an explicit extension unless supplied/approved.

## 6. Proposed API map — not implemented

| Request                                                                                           | Purpose                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/v2/explore?locale=en`                                                                   | Ordered category-type entities plus separate navigation metadata; Schedule only after its destination is defined. |
| `GET /api/v2/categories?type=...&locale=en`                                                       | Canonical categories for the selected type.                                                                       |
| `GET /api/v2/place-features?type=...&locale=en`                                                   | Filterable capabilities and visible highlight/amenity definitions.                                                |
| `GET /api/v2/places?type=...&category=...&feature=...&open_now=true&page=1&per_page=12&locale=en` | Canonical Place entities with bounded batch-loaded relations, viewer/action metadata and stable pagination.       |
| `GET /api/v2/places/:slug?locale=en`                                                              | The same Place schema and metadata for a published place.                                                         |
| `GET /api/v2/places/:slug/showtimes?date=YYYY-MM-DD&page=1&per_page=20&locale=en`                 | Published theater showtimes for a Kuwait calendar date, with canonical related movies.                            |
| `GET /api/v2/customer/me/saved-places?type=...&page=1&per_page=12&locale=en`                      | Saved published Place entities in the same schema, plus canonical save records.                                   |
| `PUT /api/v2/customer/me/saved-places/:place_id`                                                  | Idempotent save for the authenticated customer.                                                                   |
| `DELETE /api/v2/customer/me/saved-places/:place_id`                                               | Idempotent removal; no other customer identifiers accepted.                                                       |

Matching v2 admin routes must cover category types/categories, place read/write/preview/publication, features and assignments, stay/theater profiles, movies, posters and showtimes. Choose exact methods and request schemas in E1 before implementation. Extend existing browser CMS editors rather than creating an unrelated second CMS. Private customer saved lists need no general CMS browsing endpoint.

Finalize filter combination semantics in E1: primary category AND feature capability AND optional Open Now; “All” means no category/capability constraint, not a stored category. Only implement filters actually supported by populated CMS data. Add multi-feature syntax only if the app requires selecting more than one chip at once.

## 7. Approval-gated implementation order

**Obtain explicit user approval before each section.** Finishing E1 does not authorize E2–E6. For every approved section, update the API reference, OpenAPI and Postman collection alongside code and tests. Keep API routes marked planned until implemented and verified.

### E1 — Stabilize discovery baseline and freeze the contract

1. Reconcile the ongoing image change with its owner; inspect actual migration status/schema and verify existing public/CMS reads without resetting content. Fix demonstrated compatibility failures within the agreed image-work scope before building on it.
2. Run read-only local list/detail/category/type/image checks with actual editorial data. Record missing content separately from missing schema/behavior. Do not seed screenshot venues or publish placeholder prices/copy.
3. Freeze canonical Place, CategoryType, Category, translation, hours and image shapes and all new relation shapes; freeze exact DB columns, v2 paths, error/status codes, optional/null behavior and schema parity assertions. Define default relations, bounds and metadata mappings so another model does not invent different card/detail contracts.
4. Carry the confirmed decisions into the schemas: CMS owns theater content, Schedule remains pending, and the native cab flow accepts the place destination. Agree on the share URL configuration and exact cab destination payload. Pending Schedule must not block unrelated approved work.
5. Prepare ordered additive schema migrations for agreed new data and indexes. Report the target database and pending migrations before applying any required schema change. Do not rerun or reset existing migrations/data.

Acceptance: reviewed schema/contract matrix, image ownership is consistent, documented compatibility strategy, and concrete read-only baseline results. No unapproved business section starts.

### E2 — Explore hub, category filters and common place reads

1. Implement v2 Explore, categories, feature definitions, listing and detail using shared canonical serializers and publication filters.
2. Reuse the website's place/type/category rows and cover/gallery data; implement fixed relation shape and consistent localization/search behavior.
3. Add validated category/capability filters, deterministic ordering, bounded pagination and Open Now with Kuwait timezone/overnight tests. Retain uncategorized published results under All.
4. Update corresponding CMS category/type/feature and base place read/write paths to DB keys. Preserve legacy v1 behavior through its existing adapters.

Acceptance: Explore plus all four category lists can render common content; repeated Place objects have identical key/type/nullability contracts; invalid filters/pagination fail consistently; unpublished data/images remain hidden. Save controls remain pending E5.

### E3 — Place details and category-specific editorial fields

1. Add venue call phone and stay/theater profile storage/validators/editors with type applicability checks.
2. Add dining/stay highlights, theater amenities/capabilities and screen counts through structured CMS inputs.
3. Return fixed nullable profiles and feature relations on every Place response, including list, detail and admin paths; expose existing prices on lists as well as detail.
4. Preserve KWD precision, price mode/unit and unknown/free/from semantics; document check-in/out as local times and starting stay prices as editorial estimates. Do not add hotel reservation functionality.

Acceptance: Attraction/Dine In/Stay detail layouts and theater non-movie details render from structured data; Call is available only for venues with a valid phone; CMS round trips preserve exact fields.

### E4 — Theater movies, posters and dated showtimes

1. Use the user-approved CMS-maintained content source. Add manual movie, venue and dated-showtime management, with explicit content ownership and stale-content checks. No cinema provider feed or synchronization adapter is in scope.
2. Build movie/showtime models, ownership/venue validation, publication and image rules, CMS editing/import controls and audited writes.
3. Provide date-filtered/paginated showtime reads with Kuwait-day boundaries; group related movies in the response using one Movie serializer. Do not show expired/cancelled or unpublished sessions as current.
4. Define Active Movies as published movies with visible upcoming showtimes for the selected venue/date; specify an empty state when none exist. Do not invent showtimes from static chip labels.

Acceptance: active movie cards, posters, formats and time chips render; cross-venue/wrong-type assignments are rejected; no movie-ticket purchase/reservation API is claimed.

### E5 — Place bookmarks

1. Add customer-owned saved-place storage with unique customer/place keys, idempotent writes and paginated saved reads.
2. Batch bookmark lookup for lists/details and return the same viewer metadata shape everywhere. For guests, browsing works and save actions require sign-in; no guest-to-account save migration is assumed.
3. Hide unpublished/deleted places from public saved results; count/paginate using the same visibility rules. Ensure customer deletion removes saves.

Acceptance: save state agrees across lists/details/saved tabs, retries do not duplicate saves, other accounts cannot read/write saves, and personal responses are never shared-cached. Saved addresses and videos remain separate unapproved work.

### E6 — Share and cab destination handoff, integration completion

1. Agree on the mobile/public share URL and route configuration. Reuse the canonical place ID/slug; native sharing and phone dialing need no mutation endpoint.
2. For the app cab flow, return/document a destination with canonical place ID, title from its translation and usable coordinates; the app pre-fills its cab screen. Missing coordinates yield an unavailable action rather than a fabricated destination.
3. Use the user-approved native cab handoff; do not call the existing WhatsApp enquiry endpoint from this button. Until the cab section is implemented, document and test the destination payload as an integration contract, without claiming a functioning ride booking. Never treat `places.id` as `transport_locations.id`.
4. Add examples and ordered Postman requests for public/guest/customer/CMS flows, including missing content and unavailable-action states. Run contract/parity, security, visibility, filter/time, save concurrency and CMS round-trip checks, then the agreed regression/build gates in the isolated test environment.

Acceptance: app developers can integrate every approved control shown in these nine screens; any unresolved Schedule/cab/provider capability is explicitly listed as pending, not represented by an invented working endpoint.

## 8. Security, performance and verification gates

- Existing `ApiError` envelope and stable validation/error codes; bound all filters, search length, dates, page size, arrays, text and uploads. Distinguish empty lists from missing resources.
- Customer bearer ownership for saves; admin bearer or signed CMS session plus CSRF for editorial writes. Preserve role checks, audit logs and publication validation. Escape editorial text and validate external URL schemes.
- Batch relation/save/movie queries, deterministic ordering, indexes on visibility/type/category/feature joins and venue/date. No per-place query loops or unbounded galleries/showtime lists. Measure actual list payload sizes before reducing fields; do not break the shared schema to optimize cards.
- Never cache personalized bookmark metadata across customers. Guest/public caching must still respect publication state, image authorization, locale and time-derived Open Now behavior.
- Test shape/type/nullability parity across v2 public list/detail/saved and admin representations; test unknown hours, midnight/overnight boundaries, Arabic fallback, categories belonging to another type, money precision, hidden content/images, duplicate saves, account isolation/deletion and CMS read-write fidelity.
- Use isolated `kuwaitiexperience_test` under repository test rules; no destructive verification against development/production. Do not reset/seed content to make this plan or its later tests appear complete.
- Keep launch content ownership explicit: venue phone, coordinates, hours, rates, licensed images/posters and current showtimes must come from the CMS/content owner or an approved provider.

## 9. Confirmed decisions and remaining scope

1. Theater movies/showtimes: **CMS maintained for now**. Provider feeds are outside this section.
2. Schedule tile: **leave pending**. No Schedule endpoint or fabricated navigation target.
3. Book a Cab: **open the future native cab flow with this place as destination**. Cab quotation, dispatch, payment and ride creation remain separate approval-gated work.
4. Share URL/deep-link configuration and the exact cab destination payload must be frozen in E1 before dependent implementation. Venue data and licensed content remain CMS inputs, not screenshot-derived facts.

Next approval to request: **E1 — Stabilize discovery baseline and freeze the contract**. This document is a plan, not authorization to implement the later sections.
