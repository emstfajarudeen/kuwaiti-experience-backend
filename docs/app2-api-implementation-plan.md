# App 2 backend implementation plan

The [Home API and CMS section](app-api-reference.md#12-home-screen) is implemented. Home Explore cards link to existing place details; search stays pending. Rental/cab and notification functionality are outside this Home section.

Current approval status: the first account/support screens, Edit Profile, Explore additions with CMS management, Home API with CMS management, and generic FCM notification inbox/token APIs are implemented. See the [Explore guide](explore-api.md) and [app API reference](app-api-reference.md). Schedule, Home search, ride/rental notification event integrations, and actual cab ride creation remain pending. The original design-stage status line below describes the initial plan, not these completed sections.

Status: **design analysis and planning; no implementation section approved**. Source: [Figma App 2 page](https://www.figma.com/design/Ut5EtFQuXCwoux1QMCSZDD/Kuwaitiexperience?node-id=625-13471), reviewed 20 October 2026. See the [81-frame screen audit](app2-figma-screen-audit.md) and [API reference](app-api-reference.md). The earlier `IMPLEMENTATION_PLAN.md` describes the website/CMS baseline, not the full mobile product.

The first user-selected screen set is scoped in the standalone [first-screens API handoff plan](first-screens-api-handoff-plan.md): phone/OTP account access, contact, legal pages, logout and deletion. Use that document for the initial implementation; do not treat the rest of this plan as approved work.

That selected set is now implemented under `/api/v2`; the [customer API guide](customer-api.md) is the integration authority. The user chose to retain phone OTP and configure an SMS provider later. Other sections remain unapproved.

The user subsequently approved Edit Profile. Names/email, private photo upload/removal and phone changes verified by session-bound OTP are implemented in the [profile API guide](customer-profile-api.md). Saved data and the remaining app sections are still pending approval.

## Execution rule

Obtain the user's **explicit approval before starting each numbered section**. Complete that section's backend, matching CMS/operator capability, API reference/OpenAPI updates and acceptance checks before asking for the next approval. A section may include a database migration, but do not run migrations or destructive commands on development/production data as a routine side effect. Keep existing data and admin credentials intact. Product and vendor decisions below must be resolved before implementing the dependent flow.

## Cross-API contract for every section

- Persisted response attributes use the **exact MySQL column names**, including snake_case, in both mobile and CMS APIs. UI labels remain an app concern. Never alias `full_name` to `name` or `sort_order` to `order` inside an entity. Record-owned image keys (for example `places.cover_image_key`) are exposed only as derived image URL fields, never as raw storage keys.
- Each recurring resource (customer, place, vehicle, booking, driver, video, saved address, etc.) has one canonical serializer/schema. The same resource has the same required keys, nesting, nullability and JSON types in list, detail, home, history, admin and CMS responses. A distinct summary or aggregate is explicitly named as its own type; it does not masquerade as the full resource.
- Nullable fields are present with `null`; collections are present with `[]`; booleans are JSON booleans; IDs and counts are integers; money is a fixed three-decimal string with a separately named currency column; timestamps use ISO 8601 UTC. Public data may omit secret columns through one documented allowlist. Response envelopes, pagination and computed action URLs are protocol data, outside persisted entity attributes.
- Preserve the established `{ data }`, `{ meta }` and `{ error: { code, message, requestId, fields? } }` conventions, with stable error codes and validation fields. Rate-limit sensitive endpoints; enforce ownership/roles, CSRF for browser CMS forms, publication/moderation gates, input bounds, audit trails, transactions and idempotency for writes/payments. Batch relation loading and paginate large lists/feeds.
- Existing v1 responses do not yet meet these rules. Decide a compatible cutover (`/api/v2` is an option) before changing consumer-visible keys. Publish a migration matrix and exact examples; test key sets and JSON types across every endpoint returning the same entity.

## Section 1 — Foundation: schema and canonical contract

1. Audit the current tables/routes/serializers against all App 2 objects, including CMS responses. Produce an entity relationship map for customer identity, content, addresses, cab, rental, bookings, payment, video and support.
2. Decide how passwordless customers are stored separately from or alongside current password-based admin users. Define public/admin field allowlists, canonical entity shapes, status enums, money/timestamp rules and aggregate shapes.
3. Decide API version/cutover and exact persisted key migration. Establish shared serializers, OpenAPI components, contract checks and change notes before endpoint expansion.
4. Define migration sequencing, indices, retention requirements and safe rollout. Do not run migrations until a section needs them and the target database/pending changes are reported.

Acceptance: signed-off data dictionary and response examples; no conflicting key/type definitions; compatibility path and schema migration plan documented; existing admin security and data remain intact.

## Section 2 — Customer authentication, profile and account lifecycle

Screens: phone login/OTP/resend, create account, continue as guest, edit profile, language, logout and delete account.

1. Define OTP/SMS provider, E.164 phone normalization, resend/attempt limits, expiration and verified-phone change policy. Implement request/verify/resend and customer refresh/logout/session APIs using a customer guard distinct from admin JWT/cookies.
2. Implement account creation, `me`, profile edit, optional email, locale preference, consent capture/version, guest permissions and secure transition from guest to account.
3. Implement account deletion with reauthentication, session revocation, ownership checks and a documented data-retention/anonymization policy. Add CMS/customer support view only for necessary, permitted operations.

Acceptance: OTP abuse and replay prevented; customer/admin credentials cannot cross domains; `Customer` shape is identical everywhere; guest restrictions are enforced; deletion is verifiable without exposing another person's data.

## Section 3 — Discovery, home and editorial CMS

Screens: home, category lists/details for Attractions, Dine In, Stay and Theatres, search entry, Call/Book a Cab, active movies/showtimes.

1. Migrate current public content responses to the canonical contract and preserve publication/localization behavior. Define type-specific fields for restaurant highlights, hotel check-in/rates, theater amenities/movies/showtimes, call number and open-now derivation.
2. Implement only the screen-confirmed filters, ordering, pagination and search behavior. Resolve the search-results destination and theater showtime source before adding those subflows.
3. Extend CMS editors, preview, record-owned image uploads and publication validation for every new content field, with licensed images and Arabic fallback rules.

Acceptance: every shown listing/detail/home block can be rendered from documented APIs in both locales; recurring place objects have one shape; draft content never leaks; queries remain bounded.

## Section 4 — Saved addresses and saved content

Screens: saved places empty/list/add/edit/map selection; saved attractions/dining/stays/theaters/videos with empty states and bookmark controls.

1. Define map/geocoding provider and coordinate/address normalization. Add user-owned saved-address CRUD, label uniqueness/limits and safe handling of stale places.
2. Add save/unsave/list APIs for places and videos with stable content references, ownership and paginated tabs. Document guest behavior and migration of guest saves if approved.
3. Keep CMS out of private user address content except explicit support/admin permissions.

Acceptance: saved records cannot be read or changed across accounts; bookmark state is consistent across home/list/detail/video; null/empty behavior is stable.

## Section 5 — Cab quoting, dispatch and ride lifecycle

Screens: map pickup/drop-off, Now/Later, class/ETA/fare selection, Cash/Apple Pay, finding driver, driver found, ride OTP, live trip, completed, cancellation and rating entry.

1. Agree on map/routing, fleet/driver/dispatch and payment integrations. Define service area, quote expiry, estimated versus final fare, scheduled request behavior and cancellation/refund policy.
2. Add canonical location, quote, ride, driver and vehicle schemas; quote and idempotent request APIs; state transitions from requested through assigned/arriving/in-progress/completed/cancelled/failed; event or polling contract for map/ETA updates.
3. Implement driver assignment and ride-start OTP verification, payment authorization/capture or cash-due state, cancellation reasons, receipts and customer notifications. Add CMS/operator queue, driver/fleet controls and audit history.

Acceptance: invalid transitions and duplicate requests cannot create extra rides/charges; live state and payment state agree; unauthorized tracking is blocked; cancellation and failure recover cleanly.

## Section 6 — Car rental catalog, availability and checkout

Status: **implemented 5 November 2026** with CMS-managed inventory, a per-vehicle with-driver option and MyFatoorah for the booking fee. See the [rental API guide](rental-api.md). Provider e-mail notification and rental reviews remain open.

Screens: date/location/type/with-driver search, filters/sort, vehicle detail/gallery/specs/terms/provider reviews, checkout, payment method and confirmation.

1. Define provider onboarding/inventory, availability source, age/license/deposit/insurance terms, with-driver eligibility, hold duration and rate/fee calculation. Confirm the design's model: app collects a booking fee while rental amount is paid to the provider.
2. Add provider, vehicle, media, rate, availability, policy and review read models; query/filter/sort and quote APIs with exact money columns and consistent vehicle/provider shapes.
3. Add idempotent reservation/hold, booking-fee payment and gateway webhook handling, confirmation/reference, provider notification, timeout/cancellation/refund flow. Add CMS provider, fleet, availability, rate and reservation tools.

Acceptance: no double booking under concurrent checkout; booking confirmation follows verified payment/hold rules; quote totals are reproducible and snapshots remain readable after catalog changes.

## Section 7 — Unified booking history, detail and reviews

Screens: Cab/Rent tabs, booking detail variants, driver/company rating, submit/edit review.

1. Expose a unified history envelope containing explicitly typed cab or rental booking references, while each booking retains one stable resource shape across history, confirmation and detail.
2. Add ownership-protected detail/receipt APIs, pagination/filter by type/status, cancellation eligibility and status timelines.
3. Add driver/provider review create/read/update rules, one review per eligible completed booking, moderation and CMS response workflows.

Acceptance: history and detail agree on identifiers/status/money; only owner can read a booking or review it; rating counts and displayed averages are correct.

## Section 8 — Explore video feed and moderation

Screens: vertical feed, creator/place link, like/comment/share counts, comments, comment likes, save, report reasons, Book a Cab/Call.

1. Define video source, upload rights, transcoding/storage/CDN, creator identity, publication and moderation policy. No customer video-upload screen is shown, so begin with CMS/editorial upload unless product changes scope.
2. Add paginated feed, video/place relationship, like/unlike, comment CRUD, comment like, bookmark, share-link and report APIs with canonical shapes and count semantics.
3. Add CMS moderation queue and audit trail for reported videos/comments; rate limits and abuse controls.

Acceptance: unpublished/reported content follows policy; counts remain accurate under repeated requests; feed playback uses appropriate media delivery; report identity stays private.

## Section 9 — Support, legal and app configuration

Screens: Contact Us form/WhatsApp, language, privacy/terms, account controls; home search/notification affordances remain open questions.

1. Add bounded contact submission, spam controls, CMS inbox/status, secure retention and optional response workflow. Reuse site contact settings for WhatsApp.
2. Publish approved, versioned legal content with locale and consent records. Replace the unrelated placeholder Figma policy text before launch.
3. Define notification/search/schedule destinations and add their APIs only after behavior is confirmed. Keep customer locale preference synchronized with API locale choices.

Acceptance: support requests are durable and private; legal pages show the approved app-specific version; unresolved controls are documented, not silently faked.

## Section 10 — End-to-end verification and app handoff

Run typecheck, lint, functional tests and build against the guarded test database. Walk every screen-to-API flow, including empty/error/guest/Arabic states, contract schemas, admin publication/moderation, payment/dispatch failure paths and query performance. Update the [API reference](app-api-reference.md), OpenAPI, operations and deployment runbook with exact examples and cutover notes. Do not release live payment, OTP, dispatch or video features without the chosen providers and operational ownership.

## Decisions needed before dependent sections

| Decision                                                                | Needed for    |
| ----------------------------------------------------------------------- | ------------- |
| OTP/SMS vendor and customer identity/guest rules                        | Section 2     |
| Maps/geocoding/routing vendor and service coverage                      | Sections 4–6  |
| Driver dispatch source, fleet operator and live-location method         | Section 5     |
| Payment gateway, cash handling, authorization/capture, refunds          | Sections 5–7  |
| Rental inventory/provider agreement, booking-fee and cancellation terms | Section 6     |
| Video publishing rights, storage/transcoding and moderation ownership   | Section 8     |
| Approved Kuwait app privacy/terms and retention policy                  | Sections 2, 9 |
| Search, notifications and Schedule destinations                         | Sections 3, 9 |
