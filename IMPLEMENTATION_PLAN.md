# Kuwaiti Experience — implementation plan

This was the starting plan for the implementation begun on 9 October 2026. See `README.md` and `docs/operations.md` for the working application and current commands.

## 1. What the screenshots establish

The product appears to be a curated Kuwait discovery guide with a cab enquiry entry point. It helps visitors discover places, inspect visit information, and contact a transport provider. A complete booking business cannot be inferred from the screens.

| Screen | Observed content and interactions | Backend/CMS requirements |
| --- | --- | --- |
| Home | White navigation; English/Arabic switch; night skyline hero; “Explore Kuwait”; pickup, destination, date and time form; transport partner branding; WhatsApp link | Editable hero text/image, transport locations, partner assets, navigation and contact configuration |
| Home discovery | Asymmetric category tiles: Book a Cab, Attractions, Restaurants, Hotels & Resorts, Theaters | Editable category imagery, labels, ordering and destinations |
| Home listings | Four editorial sections, each with four place cards, location labels and “View more” | Published places grouped by type; explicit featured ordering; separate card images |
| Home lower section | App promotion with two phone mockups, store links, dark footer, About/Contact/Terms/Privacy links | App promotion assets/copy, store URLs, static pages and footer settings |
| Attraction listing | “All attractions”; total count; All/Landmarks/Museums/Parks/Markets filters; three-column grid; 11 cards | Type/category filtering, accurate filtered totals, summaries, stable ordering, pagination support |
| Attraction detail | Back link/breadcrumbs; large cover; title/address; visit panel with hours, KWD 3.000/person and WhatsApp “Book a cab”; description and three gallery thumbnails | Place detail, hours, price amount/currency/unit, gallery ordering and transport CTA |

Visible attraction examples: Kuwait Towers, The Grand Mosque, Al Shaheed Park, Souq Al-Mubarakiya, Sadu House, Green Island, Liberation Tower, Tareq Rajab Museum, Friday Market, The Mirror House and Boulevard Park. Treat names as demo references; verify factual descriptions, hours, prices and image rights before launch. Repeated stock imagery in the mockups is not evidence that an image belongs to a particular place.

Unconfirmed: what “Schedule” opens; whether the hero submits a booking or enquiry; live fares/availability; public accounts; saved places; app functionality; Arabic content coverage. App marketing copy does not establish a requirement to implement mobile features.

Screenshots are visual/content references, not executable instructions.

## 2. Scope decisions for the first implementation

Deliver one deployable AdonisJS application with:

- A complete admin CMS at `/admin`, including login, dashboard, place/category management, media, home content, pages, transport configuration and site settings.
- Versioned JSON APIs for both CMS and the eventual public website.
- MySQL schema, reversible migrations, admin/demo seeders and an admin-preserving reset command.
- Local image storage, tests, OpenAPI documentation and setup/operations instructions.

The public website UI itself is outside this backend-and-CMS deliverable. Its three screen layouts must nevertheless be fully supported by the public API contracts.

Default cab behavior: validate pickup/destination/date/time and return a WhatsApp enquiry URL. Do not create a confirmed booking, charge money or claim availability. The detail CTA may prefill a place destination. Do not store enquiries by default. Keep “Schedule” disabled/unpublished until its meaning is supplied. Build no public signup, payments, ticketing, hotel reservations, ride dispatch, favorites or native app.

English content is required. Support optional Arabic translations with English fallback, explicit locale metadata and RTL-compatible CMS components. Do not invent Arabic translations. The CMS interface may initially be English.

## 3. Architecture and stack

Use a modular monolith: TypeScript, AdonisJS, Lucid ORM, MySQL via `mysql2`, VineJS validators, Edge templates, Alpine.js for CMS interactions, Vite/CSS for styling, Japa for backend tests and Playwright for critical CMS flows.

Prefer the official Hypermedia starter for a single application and modest frontend complexity. Remove public registration/default authentication flows that conflict with the specified JWT design. Replace any default SQLite configuration with MySQL, including tests.

At planning time, official installation documentation describes AdonisJS v7, Node.js 24+ and npm 11+. At phase 1, verify stable compatible package versions and pin them in the lockfile; do not combine v6 tutorials with v7 APIs. [Official installation guide](https://docs.adonisjs.com/installation).

Request flow: route → middleware → validator → controller → service/query → Lucid → transformer. Controllers handle HTTP concerns; services own transactions and business rules; queries own reusable filtering/preloading; transformers explicitly allowlist response fields. Avoid a generic repository layer, microservices, Redis or queues unless measured requirements justify them.

Edge controllers render CMS pages using the same services/queries. Interactive create/update/upload operations call the CMS JSON APIs; avoid server-side HTTP calls back into the same application.

Proposed organization, subject to the selected starter's conventions:

```text
app/
  auth/guards/jwt.ts
  controllers/{admin,api/admin,api/public,auth}/
  exceptions/handler.ts
  middleware/
  models/
  policies/
  queries/
  services/{auth,content,media,transport}/
  transformers/{admin,public}/
  validators/{auth,content,media,transport}/
commands/                         # Content reset and password recovery
config/
database/{migrations,seeders,factories}/
resources/
  views/admin/{layouts,components,auth,places,categories,media,pages,settings}/
  css/
  js/
start/routes.ts                   # Imports grouped route modules
start/routes/{admin,auth,public_api,admin_api}.ts
storage/uploads/                  # Runtime files; ignored by Git
tests/{unit,functional,browser}/
docs/{openapi.yaml,operations.md,progress.md}
```

## 4. CMS visual and functional specification

The screenshots show the public website, not an admin dashboard. Match their design language in an admin layout; do not claim that an unseen dashboard layout is an exact replica.

Initial visual tokens, estimated from the images: deep navy `#00264B`, darker navy `#001B33`, warm ivory `#F8F5EF`, muted gold `#E7BC65`, white cards and muted blue-gray secondary text. Confirm by sampling references during implementation. Use generous spacing, fine separators, rounded image corners, restrained borders, circular arrow actions and gold eyebrow labels.

Typography: geometric rounded sans-serif for headings/body; tightly condensed uppercase wordmark; italic serif accent for “Kuwait” in the hero. Exact families and weights cannot be established from these raster screenshots. Obtain original fonts/logo/design file for an exact match; otherwise self-host licensed close alternatives and document that approximation. Do not substitute an unrelated dashboard theme.

CMS layout: navy sidebar, ivory canvas, gold active navigation, white editing panels, image-led place previews. Tables/forms must retain readable contrast and clear keyboard focus. Support desktop and narrow screens, accessible labels, loading/empty/error states and unsaved-change protection.

Required pages and controls:

1. Login; change password; logout. No public admin registration.
2. Dashboard: real counts by place type/status, recent edits, quick create links. No fabricated traffic/revenue charts.
3. Places: type/status/category filters, search, pagination, draft/publish/archive, edit, preview and explicit permanent-delete confirmation.
4. Place editor: basic details, English/Arabic text, category, cover/gallery, visit information, SEO and featured ordering.
5. Categories: CRUD, type assignment, order, active state; prevent deleting an assigned category without reassignment.
6. Media: upload, grid, alt text, replace/select, usage information and safe removal.
7. Homepage: hero, category tiles, partner assets, app promotion, and per-type featured places/order.
8. Static pages: About, Contact, Terms and Privacy; draft/publish and SEO.
9. Transport/settings: ordered pickup/drop-off locations, WhatsApp number, navigation/footer links, store links, branding and locale settings.

Preview should use the public-shaped serializer but require admin authentication for draft data.

## 5. Relational data model

Use InnoDB, utf8mb4, consistent IDs and UTC audit timestamps. Local visit/transport times use `Asia/Kuwait`, independent of the server/operator timezone. Monetary values use `DECIMAL(10,3)` and serialize as decimal strings to preserve KWD precision.

| Table | Important fields and constraints |
| --- | --- |
| `users` | Unique normalized email, name, password hash, role (`admin` initially), active, must-change-password, timestamps; never expose hash |
| `auth_sessions` | User FK, absolute expiry, revoked_at; session ID included in access JWT for immediate revocation |
| `refresh_tokens` | Session FK, unique token hash, expiry, consumed_at, replacement link; retain consumed records until session expiry for reuse detection |
| `media` | Unique disk/key, original name, verified MIME, bytes, dimensions, variant metadata, alt text by locale, uploader FK nullable |
| `categories` | Type, unique `(type, slug)`, display order, active, optional media FK |
| `category_translations` | Category FK, locale, name; unique `(category_id, locale)` |
| `places` | Type, category FK, globally unique stable slug, status, cover media FK, nullable coordinates, nullable price/currency, price mode (`unknown/free/from/fixed`), website/contact, published_at, featured order, timestamps |
| `place_translations` | Place FK, locale, title, short description, sanitized body, address, hours note, price unit, SEO title/description; unique `(place_id, locale)` |
| `place_hours` | Place FK, weekday, interval index, opens/closes, next-day closing flag; support split/overnight hours; explicit closed/unknown handling |
| `place_media` | Place/media FKs, order, localized caption; unique `(place_id, media_id)` |
| `pages` / `page_translations` | Stable unique page slug, status; locale title/body/SEO and uniqueness per page/locale |
| `site_settings` | Singleton validated configuration for brand/contact/navigation/footer/app links; no arbitrary executable settings or secrets |
| `home_content` | Unique locale, validated structured hero/tile/app copy and ordering; no unrestricted page-builder schema |
| `content_media` | Explicit media links to settings/home content with slot and order; use FK-backed references rather than hidden media IDs inside JSON |
| `transport_locations` / `transport_location_translations` | Stable code, optional coordinates, pickup/drop-off flags, order, active, localized name |
| `audit_logs` | Actor FK nullable, action, entity type/ID, timestamp, request ID and redacted changed fields |

Place type values: `attraction`, `restaurant`, `hotel_resort`, `theater`. One category per place initially; enforce category/type compatibility in the write service. Keep slugs stable on title edits. Add only confirmed type-specific fields later, such as restaurant cuisine or hotel star rating.

Publication requires English title, slug, summary, address and cover image. Missing hours/prices remain unknown, never fabricated. Other optional fields may be omitted from public responses. Public queries exclude draft/archived content and future publication dates.

Indexes: public listing `(type, status, published_at, id)`; category filtering `(category_id, status, id)`; unique slugs; translation uniqueness; FK indexes; refresh/session lookup and expiry indexes. Measure featured-order and search queries with EXPLAIN before adding more indexes. Cap search input and permit only allowlisted sort fields.

## 6. API contract

Create `docs/openapi.yaml` alongside implementation, with schemas, auth/cookie/CSRF behavior, examples and errors. Use `/api/v1` for public APIs and `/api/v1/admin` for protected CMS APIs.

| Routes | Purpose |
| --- | --- |
| `GET /api/v1/home` | Hero, category tiles, four bounded featured groups, partners and app promotion |
| `GET /api/v1/site` | Public navigation/footer/branding/contact settings only |
| `GET /api/v1/categories?type=attraction` | Active categories for a place type |
| `GET /api/v1/places?type=attraction&category=parks&page=1&perPage=12&locale=en` | Card data and accurate filtered pagination totals; optional bounded `q` search |
| `GET /api/v1/places/:slug?locale=en` | Published detail, cover, gallery, visit information, SEO and cab CTA metadata |
| `GET /api/v1/pages/:slug?locale=en` | Published static page |
| `GET /api/v1/transport/locations` | Active dropdown options |
| `POST /api/v1/transport/enquiry-link` | Validate location IDs and future Kuwait-local datetime; return configured WhatsApp URL; no reservation or persisted personal data |
| `/api/v1/admin/auth/{login,refresh,logout}` | POST authentication endpoints; separate documented browser-cookie and API-bearer modes |
| `GET /api/v1/admin/auth/me` / `PATCH /api/v1/admin/auth/password` | Current admin and password change |
| `GET /api/v1/admin/dashboard` | Actual content counts/recent activity |
| `/api/v1/admin/places`, `/categories`, `/pages`, `/transport/locations` | Standard list/create/detail/update/delete routes with validated IDs |
| `POST /api/v1/admin/places/:id/publish` / `/archive` | Explicit state transitions; publication validation |
| `GET /api/v1/admin/places/:id/preview` | Authenticated draft preview data |
| `/api/v1/admin/media` | List/upload/detail/update-alt/delete with usage validation |
| `PUT /api/v1/admin/places/:id/gallery` | Transactional media attachment and ordering |
| `GET/PATCH /api/v1/admin/settings` / `/home` | Typed configuration and home content |
| `PUT /api/v1/admin/home/featured/:type` | Validate ordered unique published place IDs; update atomically |

Use `{ data, meta? }` on success; pagination metadata includes page, perPage, total and lastPage. Default page size 12, maximum 50; deterministic secondary ID ordering. Empty lists return 200. Successful deletion may return 204 without a body.

Errors: `{ error: { code, message, fields?, requestId } }`. Central handler normalizes malformed JSON (400), unauthenticated (401), forbidden (403), missing/hidden resources (404), conflicts (409), upload limits (413/415), validation (422), rate limits (429) and unexpected failures (500). CMS HTML routes render suitable error views. Do not leak SQL, stack traces, passwords, tokens or internal paths.

Public card responses contain only ID, slug, type, title, summary, address and optimized cover metadata. Detail responses add body, ordered gallery and visit information. Explicit DTOs prevent exposing internal status, credentials, audit data or filesystem paths.

## 7. JWT authentication and security

Implement an Adonis custom JWT guard with a maintained JWT library, then use the framework auth middleware and an admin-role policy on every protected route. Built-in access tokens must not be substituted for the requested JWT behavior. [Custom guard documentation](https://docs.adonisjs.com/guides/auth/custom-auth-guard).

- Access JWT: initially 15-minute lifetime; pin signing algorithm; validate signature, issuer, audience, subject, expiry and session ID. Use a dedicated strong secret from environment configuration.
- Refresh tokens: cryptographically random opaque values, stored only as hashes; rotate atomically on each use; revoke the session on token reuse. Initial absolute session lifetime: seven days. Serialize refresh requests in the CMS client.
- Guard checks that the user is active/admin and the session is live. Logout revokes that session; password change/recovery revokes all user sessions immediately.
- Browser CMS uses Secure, HttpOnly, SameSite cookies in production, with appropriate paths. Do not expose tokens to localStorage. Cookie-authenticated mutations, including login/refresh/logout, require CSRF protection and origin validation.
- Document bearer mode for trusted API clients separately. Bearer requests must not fall back to ambient cookies if their token is invalid. Reject conflicting authentication sources. Default the CMS to same-origin requests.
- Hash passwords with the framework-supported strong password hasher. Rate-limit login/refresh/enquiry and uploads. No default production password, signup, or email-reset integration; provide an operator password-reset Ace command with hidden input.
- Validate only allowlisted writable fields; parameterize queries; sanitize rich text; restrict URL protocols; escape output; apply security headers and a suitable CSP; configure trusted proxies and exact CORS origins when needed.
- Structured logs include request ID and duration, with sensitive-value redaction. Authenticated responses use `Cache-Control: no-store`.

## 8. Local media and performance

Use Adonis Drive with a local disk and UUID storage keys. Store relative keys in MySQL and derive URLs through the storage service. Keep runtime uploads on persistent storage outside deploy/build directories. Production must back up both MySQL and uploads; local disk initially implies one application instance unless shared storage is introduced. [Drive documentation](https://docs.adonisjs.com/guides/digging-deeper/drive).

Start with JPEG, PNG and WebP images; 5 MB/file, 10 files/request and 20 megapixels/image, configurable. Verify decoded format and dimensions, not just extension/MIME; reject SVG/executables; re-encode images and strip metadata. Generate bounded card/detail variants. Limit multipart processing to upload endpoints, enforce a proxy/body size ceiling and clean temporary files on failure. [Upload documentation](https://docs.adonisjs.com/guides/basics/file-uploads).

Draft/unattached assets remain private through authenticated media routes. Public URLs serve only explicitly published media derivatives; check current public usage before serving, and document any short browser cache window after unpublishing. Prevent deletion while referenced. Do not fetch arbitrary remote URLs on the server.

Database and filesystem changes are not one atomic transaction: stage new files, commit references, then clean replaced files; use compensating cleanup on failures and an orphan-cleanup command for retries. Never delete shared media during place deletion.

Use selected columns, eager loading and bounded galleries/featured groups to prevent N+1 queries. Keep public content uncached initially so edits are immediately visible; optimize from measurements. Add caching only with explicit invalidation and locale-aware keys. Do not promise response-time targets without a deployment baseline.

## 9. Migrations, seeders and clean/reset behavior

Migration order: users → auth sessions/tokens → media → categories/translations → places/translations/hours/gallery → pages/translations → settings/home/media links → transport/translations → audit logs. Create FK dependencies first; `down()` removes children/constraints before parents. Name constraints/indexes consistently. Every migration must have a tested inverse. Keep production schema changes additive where possible; do not edit already-applied migrations.

Rollback-friendly means schema operations are implemented and verified in both directions. It does not mean dropped data can be recovered by rerunning a migration. MySQL DDL can implicitly commit, so a migration transaction is not protection against every partial failure. Test partial-failure recovery, use backups before destructive changes, and document batch rollback versus data restoration. [Lucid migrations](https://lucid.adonisjs.com/docs/migrations), [MySQL implicit commits](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html).

Keep demo content out of migrations. Provide:

- `AdminSeeder`: requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` through environment configuration on first creation; idempotent by normalized email; never prints credentials or resets an existing password. Fail on conflicting non-admin identity instead of silently promoting it. Optional initial must-change-password flag.
- `DemoSeeder`: explicit opt-in for development/test; stable IDs/slugs or fixture keys; repeatable without duplicates or overwriting user-edited content. Seed all 11 attraction examples, at least four entries for each other type, category filters, one complete detail/gallery example, home settings, pages and transport options. Clearly label unverified content as demo. Use licensed bundled assets or labeled local placeholders; never depend on hotlinked images.
- `node ace content:reset --dry-run`: proposed custom command listing target database, affected table counts, preserved admin IDs and managed upload files.
- `node ace content:reset --confirm <database-name>`: proposed custom execution form, refusing production unless an additional explicit production flag is supplied. Keep this operator-only, outside the CMS UI and normal seeding flow.

Reset preserves all admin user rows and password hashes, plus framework migration metadata. It deletes other business content, media references, audit rows, sessions/refresh tokens and any non-admin users. Admin credentials still work afterward, but existing sessions are invalid. Avoid creating user-owned profile media in this initial schema so preserved users cannot retain dangling media references.

Use transactional, FK-ordered `DELETE` operations; do not disable FK checks, truncate shared tables, reset schema or rerun the admin seeder. Block concurrent writes during reset. Purge only managed upload files after DB commit, using a retryable cleanup manifest outside the database. Report partial file-cleanup failures honestly; never traverse/delete arbitrary filesystem paths. After reset, APIs/CMS must handle empty content, settings must have safe defaults, and demo seeding must work again.

## 10. Phased implementation with acceptance gates

Implement one phase per model turn. Each phase includes relevant tests; do not postpone all verification to the end.

| Phase | Deliverables | Required acceptance gate |
| --- | --- | --- |
| 1 — Foundation | Verify/pin compatible stack; scaffold single app; MySQL/env setup; folders; centralized errors/logging; initial API document | App boots; environment validation works; health check reveals no secrets; typecheck/lint/build pass |
| 2 — Schema | Models, migrations, relationships, constraints and factories | Dedicated MySQL test DB: migrate up, rollback each batch, migrate again; verify FK/unique behavior; no SQLite substitutes |
| 3 — Authentication | JWT guard, login/refresh/logout/me/password, admin middleware, admin seeder, operator recovery | Tests for invalid/expired/wrong-issuer/wrong-audience tokens, CSRF, role checks, refresh race/reuse, logout and password revocation; repeat seeding preserves hash |
| 4 — Media and CMS APIs | Local storage pipeline, place/category/page CRUD, publication, galleries, transport/settings/home endpoints | Invalid uploads rejected; authorization enforced; transactional failures leave no broken references; publication rules and conflict errors verified |
| 5 — Public APIs and demo data | Home/list/detail/page/site/transport contracts, locale fallback, demo seeder | Each screenshot's content can be composed from APIs; filters/totals/order correct; drafts stay private; KWD has 3 decimals; rerun demo safely |
| 6 — CMS interface | Reference theme, login/dashboard and all editors wired to real APIs | Browser flow: login → upload → create draft → preview → publish → public API confirms → archive; responsive/keyboard/error states reviewed against references |
| 7 — Reset and operations | Admin-preserving command, orphan cleanup, backup/restore/rollback instructions | MySQL test with populated data: dry-run changes nothing; reset preserves exact credentials, revokes sessions, removes content/files; admin logs in; reseeding works |
| 8 — Final verification | Complete OpenAPI, README, environment example, production checklist and handoff | Full build/typecheck/lint/relevant tests pass; API docs match routes; query count checks on realistic fixtures; no TODO endpoints, fake dashboard values or committed secrets |

Database integration/destructive tests must use a dedicated test database with a guard rejecting development/production database names. Never execute reset/rollback tests against a user's live database.

## 11. Inputs to obtain before final visual/content sign-off

These do not block backend scaffolding; use the defaults above and document assumptions:

- Original logo, fonts, skyline/category/place photos, phone mockups and partner assets with usage rights. Exact visual parity depends on these.
- Real WhatsApp number, transport destinations and whether enquiries must eventually be stored/dispatched.
- The intended “Schedule” behavior.
- Approved English/Arabic copy, real visit hours/prices and store URLs.
- Deployment environment and persistent-disk location. No deployment is authorized by this planning request.

## 12. Copy/paste handoff prompt

> Read IMPLEMENTATION_PLAN.md and any applicable AGENTS.md. Implement only Phase [N], following earlier completed decisions. Inspect existing code before editing; do not restart or scaffold over prior work. Use the pinned AdonisJS version and its matching official documentation. Maintain MySQL, genuine JWT authentication, local disk storage, consistent errors and reversible migrations. Apply frontend-design when implementing the CMS and use the original three screenshots as visual references. Do not add unconfirmed booking/payment/public-account features. Complete the phase's acceptance gate, then update docs/progress.md with files changed, exact commands/tests and results, unresolved assumptions and the next phase. Do not claim unrun tests passed, run destructive commands on non-test data, deploy, or proceed into the next phase. Keep the final report concise.

For efficient model usage: keep one phase per request, share this plan plus the current progress file, inspect only relevant code, and retain test results. Reuse the same checkout. Reattach the original screenshots for phase 6 if starting a new chat; their temporary attachment paths are not a durable project asset library. Use a stronger review pass only for unresolved authentication, migration/reset or security issues.
