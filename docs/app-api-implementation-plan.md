# App API implementation plan

> **Superseded for the mobile App 2 scope.** The linked Figma page is now available. Use [app2-api-implementation-plan.md](app2-api-implementation-plan.md) and [app2-figma-screen-audit.md](app2-figma-screen-audit.md) for the current section plan and screen evidence. The content below is the earlier provisional website-based draft.

Status: **planning only — no API implementation approved**. Prepared 20 October 2026 from the current repository and its earlier website screen analysis. The new app screens mentioned in the request were not present in this chat or repository at review time. Reconcile this plan against every new screen before approving a section.

## 1. Screen and source inventory

The existing `IMPLEMENTATION_PLAN.md` records six website views/sections from an earlier screenshot set. Their original image files are not available here for a fresh visual inspection. This is the confirmed scope from that record and current code:

| Observed view or interaction                             | Required backend behavior                                          | Existing implementation                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Home hero, language switch, discovery tiles              | Localized home content, category types, images, settings           | `GET /api/v1/home`, `GET /api/v1/site`, CMS home/settings/type editors   |
| Home featured attraction/restaurant/hotel/theater groups | Ordered, published places by type                                  | `GET /api/v1/home`, CMS place publication/featured order                 |
| Attraction list and category tabs                        | Active categories, filter, search, count, pagination               | `GET /api/v1/categories`, `GET /api/v1/places`                           |
| Attraction detail with visit panel and gallery           | Place description, address, hours, price, gallery, cab entry point | `GET /api/v1/places/:slug`, image delivery (`GET /api/v1/images/:key`)   |
| Cab pickup, destination, date/time and WhatsApp action   | Location choices and enquiry link                                  | `GET /api/v1/transport/locations`, `POST /api/v1/transport/enquiry-link` |
| About/contact/terms/privacy and app-store links          | Published pages and site settings                                  | `GET /api/v1/pages/:slug`, `GET /api/v1/site`, CMS page/settings editors |

No current source confirms visitor registration, visitor login, favorites, booking records, payment, notifications, reviews, profiles, or a schedule workflow. The current `users` table contains administrator identities only. Any such feature visible in the new app screens must be added to the screen inventory and given its own schema, API, CMS, and security design before implementation. The word “Schedule” in the earlier screen analysis is unresolved.

### Screen review gate before Section 1 approval

For each supplied screen, record its title, visible data, actions, navigation target, state variations (loading, empty, error, signed out), locale behavior, source table, and endpoint. Follow every action to its resulting screen. Identify features that need writes, background work, third-party integration, or an administrator workflow. Resolve conflicting flows and mark business rules that screenshots alone cannot prove. Update the section list below and `docs/app-api-reference.md` after that review.

## 2. Contract rules applying to every section

1. **Database names are the entity API names.** For persisted fields, use the exact MySQL column name and snake_case spelling in public and admin JSON. For joined translation fields, use their source column names within a clearly named translation object. Do not alias a field to a UI label. Protocol envelopes such as `data`, `meta`, and `error`, route parameters, and computed actions such as a WhatsApp URL are documented separately from persisted entity fields.
2. **One canonical serializer per entity.** A `place`, `place_image`, `user`, `category`, `page`, `category_type`, `transport_location`, and settings row has the same field set, nesting, and types wherever it appears. Collections, featured groups, detail views, admin show, and CMS previews must use the same entity contract when they return that entity. Separate aggregate/view objects must have distinct documented types and must not masquerade as a partial entity.
3. **Required keys are always present.** Nullable DB fields serialize as a key with `null`, never disappear. Related collections serialize as arrays, including `[]`. Boolean fields serialize as JSON booleans, not driver-dependent `0`/`1`; IDs are integers; decimals use one documented representation (three-decimal strings for prices); timestamps use one ISO 8601 UTC representation or `null`. Locale fallback selects a value but does not change keys or types.
4. **Sensitive columns are excluded by an explicit shared contract.** `users.password`, refresh-token hashes, raw image storage keys (exposed only inside derived image URLs), secret configuration, and internal audit details are never exposed to visitor or CMS API clients. This is a security exclusion, not a renamed field. Document the exact allowlist for each returned entity.
5. **Changes are versioned and verified.** The existing v1 payloads already violate rules 1–3. Before changing them, publish exact before/after examples and a migration note for app and CMS consumers. Assess whether to introduce `/api/v2` rather than silently breaking v1. Generate OpenAPI schemas from the canonical shapes, or validate them against serializers, and add contract tests covering every route that returns a shared entity.
6. **Keep backend protections.** Validate and bound inputs; use the established `{ error: { code, message, requestId, fields? } }` API error format; retain authentication, CSRF, rate limiting, content publication filters, transactions, audit logs, publication-aware image delivery, pagination, and indexed/batched queries. Database migrations are separately planned and never run as a routine documentation/test side effect.

## 3. Step-by-step sections and approval gates

**Approval is required before beginning each numbered implementation section.** Work stops after its acceptance gate and the API reference is updated in the same section. Sections 2–6 are based on confirmed earlier website flows; new app screens may add or reorder sections.

### Section 1 — Canonical response contract and compatibility

1. Inventory every JSON response and CMS data source against the actual migrations and query results.
2. Decide versioning for the breaking response changes and publish a field/type migration matrix.
3. Define shared serializers and schemas for users, places, translations, categories, category types, place images, pages, site settings, home content, and transport locations. Keep required/nullable fields stable.
4. Reuse the serializers in list, detail, featured, preview, admin and CMS paths. Normalize MySQL booleans, decimals, IDs, and dates. Batch relations to avoid per-card queries.
5. Add contract checks for key sets and JSON types across all routes returning the same entity. Reconcile OpenAPI, integration examples, and CMS bindings.

Acceptance: identical entity shapes across all appearances; every entity field maps to a real column; no unexpected missing keys; current behavior remains secure; app team receives an explicit migration guide.

### Section 2 — Admin authentication and account

1. Align `GET /api/v1/admin/auth/me` and CMS account data with the canonical `users` response, including `full_name`.
2. Keep login, refresh, logout and password change with session revocation, token rotation, throttles and browser cookie/CSRF separation.
3. Document exact token and account responses and errors. Add register/reset/recovery routes only if approved app screens and business rules establish a need; never expose open admin registration.

Acceptance: invalid, expired and revoked credentials fail; password change revokes prior sessions; every user object has one shape; CMS and API account views agree.

### Section 3 — Discovery home, site settings and categories

1. Make home content, category types, featured groups, settings and category filters use canonical persisted keys and shared entity serializers.
2. Align CMS home, settings, category and category-type data with public responses while preserving draft/admin-only visibility rules.
3. Verify locale fallback, image references, order, empty states, and publication boundaries.

Acceptance: the home and listing entry screens can be built from documented responses in both languages; entity shapes and types match their CMS counterparts.

### Section 4 — Places, filters and details

1. Apply one `places` response contract to list, featured, detail, preview and admin endpoints. Include stable translation, hours and gallery structures as documented relations.
2. Preserve type/category/search filters, deterministic ordering, accurate totals, bounded pagination, and draft privacy.
3. Verify visit hours, KWD price precision, missing images, category references, and localized content.

Acceptance: each screen state is supported; list/detail/featured place objects pass the same contract checks; query counts remain bounded with realistic page sizes.

### Section 5 — Cab enquiry and transport locations

1. Align location fields with `transport_locations` and translation columns, including boolean and coordinate types.
2. Preserve the current future-time and pickup/drop-off validation, rate limits and WhatsApp-only outcome. Document the computed link outside the location entity.
3. Add stored bookings, fare calculation or availability only if new screens and business rules confirm them, with separate approval and schema design.

Acceptance: valid enquiry opens a usable link; invalid or unavailable choices return the standard error; no response calls it a confirmed reservation.

### Section 6 — Pages, images and CMS editorial flows

1. Align public pages and admin page/image responses with canonical table field names and stable nullable fields.
2. Verify CMS create/edit/preview/publish/archive/delete and record-owned image cleanup (files deleted after commit when replaced, removed or their record is deleted), including localized content and status transitions.
3. Reconcile API and CMS forms with the same persisted model and document upload/file responses.

Acceptance: editorial flow publishes exactly the intended content, drafts and their images remain private, no image is left without an owner except for logged cleanup failures, and API reference examples match real responses.

### Section 7 — New app-screen features, if confirmed

Add one section per distinct feature observed in the newly supplied screens. For example, visitor accounts would require separate identity roles/schema, registration, login, logout, refresh, password reset/change, profile and deletion policies; favorites would require ownership and list/write/delete APIs; actual bookings would require state transitions, idempotency and CMS operations. These are **not approved or specified yet**.

### Section 8 — End-to-end handoff

Verify all screen-to-endpoint mappings, update OpenAPI and the app reference, run typecheck/lint/functional tests/build against the dedicated test database, check authorization and performance, and provide integration examples plus a change log. Do not run destructive database commands on development or production data.

## 4. Current discrepancies to resolve in Section 1

| Entity/endpoint     | Current response                                                                         | Database contract                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin `auth/me`     | `name`                                                                                   | `users.full_name`                                                                                                                                                                             |
| Place cards         | `category`, `cover`                                                                      | `places.category_id`, `places.cover_image_key` (exposed as a derived URL)                                                                                                                     |
| Place detail        | `hoursNote`, `price.{mode,amount,currency,unit}`, `coordinates`, `seo`, `cabDestination` | `place_translations.hours_note`, `price_unit`, `seo_title`, `seo_description`; `places.price_mode`, `price_amount`, `price_currency`, `latitude`, `longitude`; computed cab action separately |
| Category type tiles | `type`, `name`, `image`, `order`                                                         | `category_types.code`, `name_en`/`name_ar`, `image_key` (exposed as a derived URL), `sort_order`                                                                                              |
| Site/home           | camelCase and nested `hero`/`app` projections                                            | `site_settings` and `home_content` snake_case columns                                                                                                                                         |
| Transport locations | `pickupEnabled`, `dropoffEnabled`                                                        | `pickup_enabled`, `dropoff_enabled`                                                                                                                                                           |
| Admin/CMS resources | list, show and write responses have different field sets                                 | one documented entity per resource; status-only write results must be typed as operation receipts, not resource objects                                                                       |
| Hours               | DB snake_case with `0`/`1` or booleans depending on driver                               | fixed boolean type for `closed` and `closes_next_day`                                                                                                                                         |

## 5. Open decisions after the new screen review

- Exact inventory of mobile-only features and resulting API sections.
- Meaning of “Schedule” and whether the cab form is an enquiry or a stored booking in the new app.
- Which version carries the breaking contract change, and the app/CMS cutover date.
- Whether client code expects a single full place entity in all contexts or an explicitly separate aggregate type. The default for this plan is one full entity.
- Approved content, image rights, Arabic copy, WhatsApp number and app-store destinations.
