# The Kuwaiti Experience — Project Guide

This guide describes the repository as implemented, based on the source, migrations, seeders, routes, tests, `README.md`, `docs/openapi.yaml`, and `docs/operations.md`. It is intended for developers, CMS operators, and deployment operators. Where documentation and code differ, the route and service implementation is authoritative; discrepancies are called out in **Known gaps and uncertainties**.

## Contents

- [1. System overview](#1-system-overview)
- [2. Repository map](#2-repository-map)
- [3. Prerequisites and local setup](#3-prerequisites-and-local-setup)
- [4. Configuration and environment](#4-configuration-and-environment)
- [5. Runtime architecture](#5-runtime-architecture)
- [6. Database and content model](#6-database-and-content-model)
- [7. Authentication and authorization](#7-authentication-and-authorization)
- [8. Public API](#8-public-api)
- [9. Admin API and browser CMS](#9-admin-api-and-browser-cms)
- [10. Media and content workflows](#10-media-and-content-workflows)
- [11. Seed, reset, and cleanup operations](#11-seed-reset-and-cleanup-operations)
- [12. Development, build, test, and lint commands](#12-development-build-test-and-lint-commands)
- [13. Deployment and production operations](#13-deployment-and-production-operations)
- [14. Security and operational concerns](#14-security-and-operational-concerns)
- [15. Troubleshooting](#15-troubleshooting)
- [16. Known gaps and uncertainties](#16-known-gaps-and-uncertainties)
- [17. Source references](#17-source-references)

## 1. System overview

The project is a private AdonisJS 7 / TypeScript application backed by MySQL. It has two related products in one process:

1. A browser-based administrative CMS at `/admin`, rendered with Edge templates and styled with Vite/CSS.
2. A versioned JSON API at `/api/v1` for the visitor-facing website and authenticated CMS clients.

The public visitor website is not in this repository. The public API supplies discovery content, places, pages, site settings, media, transport locations, and a WhatsApp enquiry URL. The transport endpoint does not create a booking, charge a fare, or claim availability.

The application is a modular monolith. HTTP controllers validate input and coordinate services; write operations use Lucid query-builder transactions; public serializers are assembled in `app/services/public_content_service.ts`. There are no application model classes under `app/models`; the generated `database/schema.ts` contains schema metadata, while current services query tables directly through Lucid's database service.

## 2. Repository map

| Path | Responsibility |
| --- | --- |
| `app/controllers/api` | Public, authentication, media, and admin JSON endpoints |
| `app/controllers/admin` | Edge-rendered CMS pages and HTML form handlers |
| `app/services` | JWT/session authentication, content writes, public queries, category types, API errors |
| `app/validators` | VineJS validation for auth, content, and transport input |
| `app/middleware` | Request bindings and the JWT/cookie admin gate |
| `app/exceptions/handler.ts` | JSON error normalization and production HTML status pages |
| `commands` | `content:reset` and `media:prune-orphans` Ace commands |
| `config` | Database, Drive, session, Shield, limiter, logger, static, Vite, hashing, and encryption settings |
| `database/migrations` | Ordered MySQL schema and category-type bootstrap |
| `database/seeders` | Administrator and non-production demo data |
| `resources/views` | Edge CMS, layout, form, and error templates |
| `resources/js` | WebAwesome enhancement, FilePond upload UI, notices, and unsaved-change warning |
| `resources/css/admin.css` | CMS design system and responsive layout |
| `docs/openapi.yaml` | API reference contract and examples of route shapes |
| `docs/operations.md` | Deployment, reset, migration, and operational notes |
| `tests/functional` | MySQL-backed authentication, CMS, content lifecycle, and public API tests |
| `IMPLEMENTATION_PLAN.md` | Historical implementation decisions and intended scope; not a substitute for current source |

Important entry points are `bin/server.ts` (HTTP server), `bin/console.ts` (Ace commands), and `bin/test.ts` (Japa test runner). `adonisrc.ts` registers framework providers, routes, validators, test suites, view meta-files, and the Vite build hook.

## 3. Prerequisites and local setup

### Required software

- Node.js 24 or newer (`package.json` declares `node >=24.0.0`)
- npm 11 or newer, as stated by the project README
- MySQL 8 or newer with permission to create databases/users
- A writable project runtime directory for `storage/uploads` (development) and `storage/test-uploads` (tests)

Check versions:

```text
node --version
npm --version
mysql --version
```

### Create databases

Use an administrator MySQL session. The application and test suite must use different databases:

```sql
CREATE DATABASE kuwaitiexperience_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE kuwaitiexperience_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kuwaitiexperience'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-database-password';
GRANT ALL PRIVILEGES ON kuwaitiexperience_dev.* TO 'kuwaitiexperience'@'127.0.0.1';
GRANT ALL PRIVILEGES ON kuwaitiexperience_test.* TO 'kuwaitiexperience'@'127.0.0.1';
```

Adjust the host, credentials, and grants for a container or remote MySQL server. Do not use a development or production database for tests.

### Install and configure

```text
npm ci
copy .env.example .env          # Windows PowerShell alternative: Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the two independent generated values in `.env` as `APP_KEY` and `JWT_SECRET`. Set the `DB_*` values to match MySQL. The normal local defaults are `DB_DATABASE=kuwaitiexperience_dev`, `APP_URL=http://localhost:3333`, `HOST=localhost`, and `PORT=3333`.

Apply the schema and create an administrator:

```text
node ace migration:run
$env:ADMIN_EMAIL='admin@example.com'; $env:ADMIN_PASSWORD='choose-a-unique-password-of-14-or-more-characters'; node ace db:seed
```

The command runs the configured seeders. `AdminSeeder` requires the two `ADMIN_*` variables when creating the first admin; ordinary reruns do not replace an existing password. `DemoSeeder` is intended for development/test and creates labelled placeholder content.

Start development mode:

```text
npm run dev
```

Open `http://localhost:3333/admin/login`. The health check is:

```text
curl http://localhost:3333/api/v1/health
# {"data":{"status":"ok"}}
```

## 4. Configuration and environment

`start/env.ts` validates these variables during boot. `.env.example` is the complete checked-in example; `.env` is ignored by Git. `.env.test` overrides only test-specific values and inherits the remaining settings from `.env`.

| Variable | Required/meaning |
| --- | --- |
| `NODE_ENV` | `development`, `production`, or `test` |
| `PORT` / `HOST` | HTTP bind port and host |
| `LOG_LEVEL` | Logger minimum level |
| `TZ` | Example sets UTC; timestamps are stored/handled as UTC except transport input |
| `APP_KEY` | Secret for AES-256-GCM encryption, including encrypted cookies |
| `APP_URL` | Application URL; must be a valid URL without a required TLD |
| `SESSION_DRIVER` | `cookie`, `memory`, or `database`; `.env.test` uses `memory` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | MySQL connection; password is optional at schema level |
| `DB_DEBUG` | Optional boolean; enabled only for development database debugging |
| `JWT_SECRET` | Independent secret for HS256 access tokens |
| `JWT_ISSUER` / `JWT_AUDIENCE` | JWT verification constraints |
| `LIMITER_STORE` | `database` or `memory`; deployed instances should use database, tests use memory |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeder-only process environment, not part of the application env schema |
| `ADMIN_SEED_RESET_PASSWORD` | Set to `true` only for an intentional non-production seeded password reset |

The session cookie is `adonis-session`; browser admin tokens are `admin_access` and `admin_refresh`, scoped to `/admin`, HttpOnly, SameSite=Lax, and Secure in production. Access tokens last 15 minutes; refresh sessions have a seven-day absolute lifetime.

Drive uses a private local disk. Development and production files are under `storage/uploads`; test files use `storage/test-uploads`. Files are deliberately not served through the static-file alias. Vite emits assets to `public/assets`, and the build copies Edge views and `public/**` according to `adonisrc.ts`.

## 5. Runtime architecture

The global server middleware binds request services, serves static assets, and runs Vite middleware. Router middleware runs body parsing, sessions, and Shield. Named `jwtAdmin` middleware protects both `/admin` and `/api/v1/admin` groups.

Request flow is:

```text
route -> body/session/Shield middleware -> jwtAdmin (protected routes)
      -> controller -> Vine validator/service/query -> MySQL or Drive -> response/view
```

The API uses explicit `{ data }` envelopes and pagination adds `meta`. API failures are normalized by `app/exceptions/handler.ts` to `{ error: { code, message, requestId, fields? } }`. Unexpected API errors are logged and returned as `500 INTERNAL_ERROR`; SQL duplicate and foreign-key-reference errors become `409` responses. HTML CMS failures use redirects/flash messages for handled form errors and custom 404/500 pages in production.

The API uses bearer authentication only. The browser CMS uses the signed HttpOnly access cookie, with refresh handling through `/admin/refresh`. The middleware rejects cookies on API requests and rejects simultaneous bearer/cookie credentials.

## 6. Database and content model

Migrations run in this order:

1. `users`
2. `auth_sessions` and `refresh_tokens`
3. content tables: media, categories/translations, places/translations, hours, galleries, pages, settings, homepage, transport, audit logs
4. `rate_limits`
5. `category_types`, initially populated with `attraction`, `restaurant`, `hotel_resort`, and `theater`
6. foreign keys linking category and place `type` values to `category_types.code`

The main tables and behavior are:

- `users`: normalized unique email, scrypt password hash, role, active flag, and `must_change_password`. Password is excluded by the generated schema serializer.
- `auth_sessions` / `refresh_tokens`: session revocation state and hashed, one-time refresh tokens.
- `category_types`: dynamic discovery/place types with English/Arabic names, optional image, and sort order.
- `categories` / `category_translations`: type-scoped slugs, active state, ordering, optional image, and localized names.
- `places` / `place_translations`: stable slug, dynamic type, optional category, draft/published/archived status, cover media, coordinates, KWD price mode/amount, website, featured order, localized editorial and SEO content.
- `place_hours`: weekday intervals, optional overnight closing, and explicit closed state. The CMS JSON uses weekday `0` for Sunday.
- `place_media`: ordered gallery references with optional captions. Duplicate media on one place is rejected.
- `pages` / `page_translations`: localized static pages with publication state and SEO fields.
- `site_settings`: singleton row `id=1` for brand, contact, WhatsApp, store links, and logo.
- `home_content`: one row per locale for hero eyebrow/title, discovery heading, and hero media. Featured places are selected on each place through `featured_order`.
- `transport_locations` / translations: active pickup/drop-off choices and order.
- `audit_logs`: actor, action, entity, optional changed fields/request ID, and timestamp.
- `rate_limits`: database limiter state when `LIMITER_STORE=database`.

Foreign keys protect referenced media and content. Places and categories cannot be deleted or type-changed while their dependent relationships make that unsafe. Prices are stored as `DECIMAL(10,3)` and public responses format amounts to three decimal places; currency defaults to KWD. Local transport date-times are interpreted in `Asia/Kuwait` and must be future values no more than one year ahead.

Migrations are reversible at schema level, but rollback drops tables and data. Back up production before applying or rolling back migrations; never use migration rollback as a content reset.

## 7. Authentication and authorization

### Admin JWT API

`POST /api/v1/admin/auth/login` validates credentials, creates an auth session, stores only a SHA-256 digest of a random refresh token, and returns:

```json
{"data":{"accessToken":"<JWT>","refreshToken":"<opaque-token>","expiresIn":900}}
```

Access tokens are HS256 JWTs containing subject and session ID claims and are checked for signature, issuer, audience, expiry, active admin user, and live session. Send them as:

```text
Authorization: Bearer <accessToken>
```

`POST /api/v1/admin/auth/refresh` consumes the old refresh token and returns a replacement pair. Reuse of a consumed token revokes the whole session. `POST /auth/logout` revokes the current session. `PATCH /auth/password` requires a 14-character minimum new password, changes the scrypt hash, and revokes every session for that user.

### Browser CMS

`POST /admin/login` sets `admin_access` and `admin_refresh` cookies and redirects to `/admin`. An expired access cookie can use `POST /admin/refresh`; invalid refresh state clears both cookies. Logout revokes the session and clears both cookies. CMS forms include a Shield CSRF field through `resources/views/components/form/index.edge`; the functional test confirms a content POST without a CSRF token does not create a record.

The browser gate redirects unauthenticated HTML requests to `/admin/login`, while API requests receive `401`. All authenticated responses set `Cache-Control: no-store` through the admin middleware.

### Throttling

- Admin login/refresh: 10 requests per IP per minute, blocked for 15 minutes.
- Public enquiry: 20 requests per IP per minute.
- Media upload: 20 requests per hour per authenticated admin (or IP fallback).

## 8. Public API

All routes below are relative to the application origin. Full OpenAPI documentation is in `docs/openapi.yaml`; frontend response examples are in `docs/frontend-api-responses.md`.

### Health, discovery, and content

| Method/path | Behavior |
| --- | --- |
| `GET /api/v1/health` | Returns `{ data: { status: "ok" } }`; confirms HTTP availability, not database health |
| `GET /api/v1/home?locale=en\|ar` | Hero, ordered dynamic category-type tiles, featured published places grouped by type, and app store links |
| `GET /api/v1/site` | Public brand/contact/logo/store fields; exposes only `whatsappAvailable`, not the number |
| `GET /api/v1/categories?type=<code>&locale=en\|ar` | Active categories for an existing dynamic type |
| `GET /api/v1/places?type=<code>&category=<slug\|all>&q=<text>&page=1&perPage=12&locale=en` | Published place cards and filtered pagination |
| `GET /api/v1/places/:slug?locale=en\|ar` | Published place detail, gallery, hours, price, coordinates, SEO, and cab destination metadata |
| `GET /api/v1/pages/:slug?locale=en\|ar` | Published static page |
| `GET /api/v1/transport/locations?locale=en\|ar` | Active pickup/drop-off options |
| `POST /api/v1/transport/enquiry-link` | Validates two distinct location IDs and future Kuwait-local time, then returns a WhatsApp URL with `confirmed: false` |
| `GET /api/v1/media/:id` | WebP/image bytes only while the media is referenced by published content |

Locale accepts `en` or `ar`; other/missing values fall back to English. Arabic fields fall back independently to English where the service uses `COALESCE`. Place list search currently searches English title and summary. `category=all` or an omitted category includes uncategorized places.

Example requests:

```text
GET /api/v1/home?locale=en
GET /api/v1/categories?type=attraction
GET /api/v1/places?type=attraction&category=parks&page=1&perPage=12
GET /api/v1/places/kuwait-towers
GET /api/v1/pages/about-us?locale=en
```

Transport request:

```json
{"pickupId":7,"destinationId":8,"dateTime":"2027-01-15T14:00:00"}
```

A successful transport response contains a URL such as `https://wa.me/<configured-number>?text=...`; it is an enquiry link, not a reservation. A missing configured WhatsApp number returns `503 ENQUIRIES_UNAVAILABLE`.

### Response and error conventions

Successful JSON content is under `data`. Place lists also return:

```json
{"meta":{"page":1,"perPage":12,"total":42,"lastPage":4}}
```

Failures use:

```json
{"error":{"code":"INVALID_TYPE","message":"Choose a valid place type","requestId":"<id>"}}
```

Validation may add `fields`. Common implemented codes include `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `INVALID_TYPE`, `INVALID_PAGINATION`, `INVALID_MEDIA`, `INCOMPLETE_PLACE`, `MEDIA_IN_USE`, `TYPE_IN_USE`, `INVALID_LOCATION`, `INVALID_TIME`, `RATE_LIMITED`, `NOT_FOUND`, `CONFLICT`, and `INTERNAL_ERROR`. Empty lists return `200`; successful deletes use `204`.

## 9. Admin API and browser CMS

### JSON admin routes

Every route under `/api/v1/admin` except login and refresh requires a bearer JWT. The resource groups are:

- Auth: `GET /auth/me`, `POST /auth/logout`, `PATCH /auth/password`.
- Dashboard: `GET /dashboard` for real place counts by type/status, page/media counts, and recent audit actions.
- Places: list/create/show/update/delete, preview, publish, and archive. Place list pages at 20 records; public list default is 12 and maximum 50.
- Category types: list/create/update/delete by code. Deletion returns `409 TYPE_IN_USE` if categories or places reference the type.
- Categories: list/create/update/delete. A category cannot be deleted while places reference it.
- Pages: list/create/show/update/delete/publish/archive.
- Media: list/upload/admin file/delete. Deletion is blocked while any known content reference exists.
- Settings/home: read/update singleton site settings and localized homepage fields.
- Transport locations: list/create/update/delete.

Writable fields are Vine-validated. Place publication requires English title, summary, address, and a cover image. A place can be saved as draft before it is complete; public services exclude draft, archived, and future-published content. Admin preview uses the public-shaped serializer but permits draft data.

### Browser CMS sections

The Edge CMS navigation exposes:

- **Overview** (`/admin`): dynamic counts by category type, published count, media count, recent audit activity, and quick links. It does not show fabricated traffic or revenue metrics.
- **Places**: type filter, list, create/edit, English and optional Arabic content, category, cover/gallery selection, price, hours JSON, coordinates, website, SEO, featured flag, preview, publish, archive, and permanent delete.
- **Categories**: create/edit/delete type-scoped visitor filters. Deletion is blocked when used by a place.
- **Category types**: create/edit/order/delete dynamic discovery tiles and optional media. An in-use type cannot be removed.
- **Media library**: upload images, edit English/Arabic alt text, inspect private images, and delete unreferenced images.
- **Pages**: edit English/Arabic body and SEO, save draft, publish, archive, and permanently delete.
- **Homepage**: edit English or Arabic hero and discovery headings/media. Tile names/order/images are managed under Category types; featured places are managed in the place editor.
- **Transport**: maintain ordered locations and pickup/destination/active flags.
- **Site settings**: brand, logo, contact email, WhatsApp number, App Store and Google Play URLs.
- **My account**: change password; all active sessions are revoked.

The CMS is responsive, uses a navy/ivory/gold design system, and enhances native controls with WebAwesome. FilePond provides upload previews and client-side type/size hints. The JavaScript marks editor forms as changed and shows the browser unsaved-change prompt. Destructive actions use a confirmation dialog. Server-side CSRF remains required for non-GET browser forms.

## 10. Media and content workflows

### Upload and delivery

Accepted upload extensions are JPEG, JPG, PNG, and WebP. The API limits a file to 5 MB and the multipart parser limits the complete request to 6 MB. `sharp` decodes the image, checks the decoded format and a 20-megapixel maximum, rotates it, re-encodes it as WebP at quality 82, and strips the original representation/metadata through re-encoding. Files receive UUID-based `.webp` keys and a media row records dimensions, bytes, MIME, original name, and alt text.

Admin files are available at `/api/v1/admin/media/:id/file` or `/admin/media/:id/file` only behind admin authentication. Public `/api/v1/media/:id` checks references to published places, active categories/category types, homepage media, or site logo before streaming the file. Public media is cached for 60 seconds. Media deletion is rejected if referenced; file and database deletion are separate operations, so orphan cleanup exists for recovery.

### Recommended editorial lifecycle

1. Upload a licensed or clearly labelled image and provide English alt text.
2. Create or edit a draft place/page.
3. Add English required content; add complete Arabic title/summary/address together for places when using Arabic fields.
4. Select cover/gallery media and, for places, validate structured hours JSON.
5. Use admin preview for draft content.
6. Publish only after factual copy, price, hours, image rights, and SEO are approved.
7. Mark a place/page featured only when it should appear in the landing response; featured places still must be published.
8. Archive to remove public visibility without deleting the record; permanently delete only with operator approval.

The demo fixtures explicitly say their copy, hours, prices, and images are placeholders. They must not be treated as verified visitor information.

## 11. Seed, reset, and cleanup operations

### Administrator seeding

```text
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<14+ character secret>' node ace db:seed --files database/seeders/admin_seeder.ts
```

On first creation, the seeder creates an active admin named `Administrator` and sets `must_change_password=true`. On normal rerun, an existing admin password is not changed. A configured email belonging to a non-admin causes failure rather than promotion.

Intentional development/test reset of the configured admin password:

```text
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<8+ character local secret>' ADMIN_SEED_RESET_PASSWORD=true node ace db:seed --files database/seeders/admin_seeder.ts
```

This is disabled in production, revokes the admin's active sessions, and should not be left in a persistent environment.

### Demo data

The demo seeder refuses `NODE_ENV=production`, is intended to be repeatable, and creates dynamic types, attraction/category examples, additional restaurant/hotel/theater examples, placeholder WebP media, transport locations, default site settings, homepage content, and draft information pages. It does not populate real WhatsApp or store URLs. Run it only in a disposable or non-production environment:

```text
node ace db:seed --files database/seeders/demo_seeder.ts
```

### Content reset

This is destructive and irreversible without a backup. It preserves all admin user rows/password hashes and migration metadata, but deletes content, media rows, sessions/tokens, rate limits, audit logs, and non-admin users. It also attempts to delete managed upload files after the database transaction.

```text
node ace content:reset --dry-run
node ace content:reset --confirm=kuwaitiexperience_dev
# production additionally requires:
node ace content:reset --confirm=kuwaitiexperience_production --force-production
```

The command accepts only database names matching `kuwaitiexperience_{dev|test|staging|production}` and requires an exact confirmation value. Pause writes and back up MySQL plus uploads first. If file deletion is incomplete, use the orphan command.

### Orphan cleanup

```text
node ace media:prune-orphans
node ace media:prune-orphans --delete
```

The first lists managed files with no `media` row. The second deletes only UUID `.webp` files and `demo/<slug>.webp` files that are not recorded in the selected environment's media table.

## 12. Development, build, test, and lint commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install lockfile dependencies |
| `npm run dev` | Start Adonis development server with HMR |
| `npm start` | Start `node bin/server.js` (built production entry point) |
| `npm run build` | Build server and Vite assets into `build/` |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run `eslint .` |
| `npm run format` | Format the repository with Prettier; review changes before committing |
| `npm test` | Run the configured test command |
| `node ace test functional` | Run the functional suite explicitly |
| `node ace migration:run` | Apply migrations |
| `node ace migration:rollback` | Roll back the latest migration batch; disposable/test data only |

Tests set `NODE_ENV=test`, use `.env.test`, require the exact database name `kuwaitiexperience_test`, migrate the database in setup, and truncate tables between functional tests. They use Japa API/browser plugins, but the repository currently contains functional specs only; `adonisrc.ts` also defines unit and browser suites for future/absent files. The test database and `storage/test-uploads` must never contain development or production data.

Before a release, run:

```text
npm run typecheck
npm run lint
node ace test functional
npm run build
```

## 13. Deployment and production operations

1. Provision MySQL with a dedicated least-privilege application user and a production database name accepted by operational safeguards.
2. Configure `NODE_ENV=production`, a public `APP_URL`, exact host/port, strong independent `APP_KEY` and `JWT_SECRET`, JWT issuer/audience, database credentials, and `LIMITER_STORE=database`.
3. Build with `npm run build`.
4. Deploy the generated build and persistent `storage/uploads`. Do not put uploads in an ephemeral build directory.
5. From the deployed application/build context install runtime dependencies with `npm ci --omit=dev` where appropriate.
6. Run `node ace migration:run` as a controlled release step before serving traffic. Production migration rollback is disabled by the database config.
7. Create the first administrator with `database/seeders/admin_seeder.ts` only if required. Do not run the demo seeder in production.
8. Start with `npm start` (`node bin/server.js`) under the chosen process manager.
9. Back up MySQL and `storage/uploads` together. A local Drive disk is safe for one application instance; multiple instances require shared storage or another Drive adapter.
10. Verify `/api/v1/health`, admin login, a public content request, private/public media behavior, logs, and write permissions.

The app's HSTS setting is enabled, cookies become Secure in production, Shield provides CSRF for browser routes and clickjacking/content-sniffing headers, and API auth responses are not cacheable. Configure the reverse proxy's trusted-proxy behavior, TLS, request/body limits, exact CORS policy if a separate frontend needs it, and process restart/health checks at the deployment layer; those settings are not present in this repository.

## 14. Security and operational concerns

- Never commit `.env`, credentials, JWT secrets, admin passwords, or uploaded files. `.gitignore` excludes these paths.
- Keep `APP_KEY` and `JWT_SECRET` independent; rotating either invalidates corresponding encrypted data/tokens and requires a planned migration.
- Do not send CMS cookies to API routes; use bearer tokens. Do not store access/refresh tokens in browser local storage.
- Refresh tokens are hashed at rest, rotated, and reuse-detected. Keep login/refresh requests serialized in clients.
- Use a dedicated test database; the test bootstrap rejects any other database name.
- Keep local uploads persistent and backed up with database content. Database and filesystem changes are not atomic.
- Restrict production admin access at the network/proxy layer where possible. There is one role (`admin`) in current code; no fine-grained CMS roles exist.
- Public API input is bounded for pagination, search, upload size, image pixels, and transport time. URLs are restricted to HTTP/HTTPS by validators/services.
- Rich text is stored in page/place bodies, but this repository does not implement a dedicated rich-text sanitizer pipeline. Treat editorial HTML and any future editor integration as untrusted until reviewed.
- CSP is configured but explicitly disabled (`enabled: false`) in `config/shield.ts`; production should not assume CSP protection.
- Review the dependency audit note in `docs/operations.md` before launch. Do not run `npm audit fix --force` without framework compatibility and regression review.
- The health endpoint reports HTTP readiness only and does not perform a database check.
- Audit logs record actions, but request IDs and changed-field payloads are not consistently populated by every controller.

## 15. Troubleshooting

**Application will not boot or reports an environment error.** Compare `.env` with `.env.example`; check enum values, URL format, numeric port/database values, and independent secrets. Ensure the server is running with Node 24+.

**MySQL connection or migration failure.** Confirm MySQL is running, `DB_HOST`/`DB_PORT` match the server, credentials are valid for the configured host, the database exists, and the user has grants. Run `node ace migration:run` again after correcting configuration.

**Tests target the wrong database.** `.env.test` must resolve to exactly `kuwaitiexperience_test`. Never override `DB_DATABASE` to development or production for a test run.

**Admin login fails.** Confirm `AdminSeeder` completed, use the exact email/password supplied to that run, and remember normal seeding does not overwrite an existing password. A changed password revokes prior sessions. Check the `admin_access` and `admin_refresh` cookie path/domain and production HTTPS configuration.

**Browser form redirects to login or does not save.** The CMS requires a Shield CSRF field. Use the rendered form rather than a hand-built POST, keep cookies enabled, and inspect the session/flash error. API routes intentionally bypass CSRF because they require bearer authentication.

**Uploads fail.** Use JPEG/PNG/WebP, remain under 5 MB and 20 megapixels, provide `alt_en`, and keep the complete multipart request below 6 MB. Ensure `storage/uploads` is writable. The test environment writes to `storage/test-uploads`.

**Images disappear from the public API.** Public delivery requires a reference from currently published content. Draft/unreferenced media remains admin-only. After a failed cleanup, inspect with `node ace media:prune-orphans`.

**CMS assets are missing.** Use `npm run dev` for Vite middleware in development or deploy the generated `public/assets`/build output. Confirm the build includes Edge views and the process is serving the correct working directory.

**Sharp/SWC native cache permissions fail.** Set `SWC_NATIVE_BINDING_CACHE` to a writable directory for the failing command, then retry. This variable is not application configuration and is not validated by `start/env.ts`.

**Transport enquiry returns 503.** Set a valid international `whatsappNumber` in Site settings. A successful link still means only “enquiry URL generated”; it is not a confirmed booking.

## 16. Known gaps and uncertainties

These points are intentionally not guessed:

- The public frontend, native app, booking/dispatch system, payments, customer accounts, favorites, and live availability are outside this repository.
- The real WhatsApp number, approved venue copy, prices/hours, licensed photography/logo assets, store URLs, and complete Arabic copy are not supplied by source. Demo values are placeholders.
- The meaning of a “Schedule” navigation concept is unresolved; no schedule workflow is implemented.
- `home_content` has database columns for app title/body/media, but current admin/API code only edits/returns hero and discovery fields; app promotion copy/artwork is not CMS-managed.
- `featured_order` is toggled as a boolean-like default (`0` for featured) rather than offering a CMS ordering editor. Ordering is therefore primarily database/order-of-selection behavior, not an explicit editorial drag-and-drop workflow.
- `docs/openapi.yaml` describes the intended API contract but is not generated from routes. Validate it against `start/routes.ts` when changing endpoints. In particular, some documented request/response details are broader than the current controllers.
- The test configuration declares unit and browser suites, but no `tests/unit` or `tests/browser` files are present in the repository inventory. Current automated coverage is functional/MySQL coverage.
- `config/shield.ts` disables CSP, despite the broader security goals in `IMPLEMENTATION_PLAN.md`.
- The local filesystem adapter and process configuration do not provide multi-instance shared media or backup automation.
- The checked-in code has no explicit proxy/CORS/observability/deployment manifest. Configure those at the deployment boundary and verify them in the target environment.
- `config/logger.ts` reads `APP_NAME`, while `start/env.ts` and `.env.example` do not define it. The effective logger name should be verified during deployment; it is not documented as a supported application variable.
- The repository contains no `app/models` implementation despite the historical plan describing models; direct table queries are the current convention.

## 17. Source references

- [README.md](README.md) — setup, requirements, quick commands, API overview, and operational cautions.
- [docs/openapi.yaml](docs/openapi.yaml) — route inventory and API schemas.
- [docs/frontend-api-responses.md](docs/frontend-api-responses.md) — visitor frontend integration examples and response shapes.
- [docs/operations.md](docs/operations.md) — production/reset/migration guidance and dependency-audit note.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — historical scope and decisions; use current code for implementation truth.
- `start/routes.ts`, `start/env.ts`, `config/*` — runtime route/configuration truth.
- `app/services/*`, `app/controllers/*`, `app/validators/*` — behavior, validation, and response implementation.
- `database/migrations/*`, `database/seeders/*`, `commands/*` — schema, fixtures, and operator actions.
- `tests/functional/*` — executable behavior checks.

