# Operations

## Configuration

Use `.env.example` as the variable list. `APP_KEY` and `JWT_SECRET` must be independent random secrets. Keep MySQL credentials, initial admin password, and both secrets out of source control. `LIMITER_STORE=database` is recommended for deployed instances; `memory` is used by the isolated test environment. Application timestamps are UTC, while cab enquiry input is interpreted in `Asia/Kuwait`.

The local Drive disk stores files in `storage/uploads`. Keep this directory on persistent storage and back it up with the MySQL database. One writable application instance is the safe starting topology for local disk; multi-instance deployment needs shared storage or a storage adapter change. Tests use `storage/test-uploads`.

Each stored image belongs to exactly one record slot: a place cover (`places.cover_image_key`), a place gallery row (`place_images.storage_key`), a category type tile (`category_types.image_key`), a per-locale homepage hero (`home_content.hero_image_key`), the site logo (`site_settings.logo_image_key`), or a movie poster. There is no shared media library. Files are stored as `<uuid>.webp` (demo seeds use `demo-<slug>.webp`) after JPEG/PNG/WebP decoding, rotation and WebP re-encoding; limits are 5 MB and 20 megapixels per file, 5 files per request, a 26 MB multipart body, and 60 uploaded files per hour per admin (counted per file, only when files are attached). Multipart bodies are auto-processed only for the route patterns listed in `config/bodyparser.ts`; a new upload route must be added there. Replacing or removing an image, or deleting its record, deletes the file after the database transaction commits; a failed deletion is logged and left for `images:prune-orphans`. Serve images through the app routes (`/api/v1/images/{key}` publicly, `/admin/images/{key}` and `/api/v1/admin/images/{key}` for authenticated previews), not a public static alias. Public image responses can remain cached for up to 60 seconds after publication changes.

Migration `1760000000008_replace_media_with_entity_images` removes the `media` and `place_media` tables and the old `*_media_id`/`image_id` columns. Existing image assignments are discarded, not converted: back up MySQL and uploads before running it, re-upload images through the CMS afterward, and remove the old files with `node ace images:prune-orphans` (inspect, then `--delete`) or manually. Its `down()` recreates the old empty structure only.

## First administrator

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 14 characters) for the initial seeder run. Ordinary seeding inserts only when the email is absent and will not reset an existing credential. Remove `ADMIN_PASSWORD` from the environment afterward. The administrator can change the password at `/admin/account`, which revokes every active session.

For a one-time development/test reset through the seeder, set `ADMIN_PASSWORD` and run `ADMIN_SEED_RESET_PASSWORD=true node ace db:seed --files database/seeders/admin_seeder.ts`. The reset requires at least eight characters, replaces only the configured admin's password hash, and revokes that admin's sessions. It refuses production. Do not leave the reset flag set for routine seeding.

## Schema changes and rollback

Apply `node ace migration:run` before serving a release. On a disposable test database, `node ace migration:rollback` reverts the latest batch; the functional test runner also migrates and rolls back all four initial migrations. Back up live data before a migration because `down()` drops tables and their contents. Never use schema rollback as a content reset.

## Content reset

1. Make a coordinated MySQL plus upload-directory backup and pause writes.
2. Run `node ace content:reset --dry-run` and inspect the database name, admin IDs, and table counts.
3. Run `node ace content:reset --confirm=<exact-DB_DATABASE>`. Production additionally requires `--force-production`.
4. If file cleanup reports a failure, run `node ace images:prune-orphans`, inspect its list, then `node ace images:prune-orphans --delete`. The command ignores files younger than one hour.
5. Verify admin login and empty public APIs. Demo data can be reseeded in non-production environments.

The reset performs FK-ordered deletes in a transaction and preserves admin user rows/password hashes and migration metadata. It revokes all sessions. The file deletion occurs after commit, so preserve the backup until cleanup has been checked. Do not run test and development environments against the same database; their upload directories are already separated.

## Health and validation

`GET /api/v1/health` confirms the HTTP app is running. Run `npm run typecheck`, `npm run lint`, `node ace test functional`, and `npm run build` before release. Functional tests require `kuwaitiexperience_test`; the runner refuses another name. The dashboard shows content counts and recent audit actions, not fabricated traffic metrics.

The 9 October 2026 production dependency audit reports 18 high-severity entries cascading from an upstream `braces` advisory through AdonisJS tooling. The latest published `braces` version checked was 3.0.3, and npm's automatic fix proposes incompatible framework downgrades. Review this advisory and upstream releases before a public production launch; do not use `npm audit fix --force` without a migration and regression review.

## Pending production inputs

Replace demo placeholders with licensed photos and approved content. Confirm actual entry prices, opening hours, transport destinations, WhatsApp number, app-store URLs, Arabic copy, and the meaning of the navigation item “Schedule.” The current enquiry endpoint only produces a link and does not store reservations or imply availability.

# Customer accounts and support (API v2)

Edit Profile migration `1760000000007_add_customer_profile` adds nullable `customers.profile_photo_id` and binds phone-change OTPs to a purpose, customer and session. Public login OTP proofs cannot change a phone, and phone-change proofs cannot log in. Profile photos are private WebP files under `customer-profiles/`, resized within 1024×1024 with original metadata removed. Replacement, removal and account deletion clean up old files after the database commit. Cleanup failures are logged; `images:prune-orphans` recognizes only managed UUID WebP profile orphans older than one hour and protects referenced files. Inspect its dry run before `--delete`. No filesystem cleanup command is executed automatically as a migration side effect. See [profile API guide](customer-profile-api.md).

Migration `1760000000006_create_customer_accounts` adds separate customer, OTP, opaque session/refresh and contact request tables. Its legacy legal acceptance table is no longer used by registration. No existing content or admin identity is rewritten. Follow the normal controlled migration procedure; never seed/reset content to enable these endpoints.

Phone verification is disabled by default. Configure an independent `CUSTOMER_OTP_SECRET` (32+ characters), an HTTPS `SMS_WEBHOOK_URL` and secret `SMS_WEBHOOK_TOKEN` when the provider is chosen. The adapter receives a bearer-authenticated JSON `{ phone_e164, message }`, must return 2xx only if accepted for delivery, and must not log OTPs or credentials. Provider timeout is 10 seconds; redirects are rejected. For development or staging servers, set `CUSTOMER_OTP_SECRET` and `CUSTOMER_OTP_DEV_RESPONSE=true`; request/resend then skip SMS and issue challenges verified with fixed code `2580`. This mode allows 10 OTP requests per phone per minute without a resend cooldown; normal SMS mode retains 5 sends per hour and a 60-second cooldown. The code is not included in responses. This temporary option also works with `NODE_ENV=production` and is disabled only in tests. Disable it before serving real customer traffic. Test injection remains restricted to `NODE_ENV=test`. Resend email is not the selected phone transport.

Publish approved pages with slugs `privacy-policy` and `terms-and-conditions` through the existing CMS when the app needs to display them. Account creation does not check or store legal acceptance. The app handles that flow. Render legal body safely according to its `body_format`. Configure `site_settings.whatsapp_number` through Site settings for Contact Us. Customer submissions are stored in `/admin/contact-requests`, protected by existing cookies/CSRF; no email forwarding is configured.

Customer deletion requires OTP verification within 10 minutes and erases the customer, owned contact requests, phone challenge and cascading sessions/refresh digests/legal snapshots. Guest submissions are not assigned to an account merely by matching unverified email text. Review this erasure policy before adding booking/payment tables; none exist in this section. Existing administrative audit entries contain no customer message text.

Expired customer sessions and old OTP state are not automatically purged in this release; arrange a retention job before public rollout. Keep the OTP hourly send window when pruning challenges, and remove expired sessions with their refresh records through their foreign keys. Use the production database limiter, TLS and the existing backup procedure. Full API integration details are in [customer-api.md](customer-api.md).

# Explore content and deployment

Explore v2 and its CMS editors require `1760000000009_add_explore_content`, following the entity-owned image schema from `1760000000008_replace_media_with_entity_images`. Migration 0009 is additive: four nullable place columns and feature/assignment/save/movie/showtime tables; it does not seed or publish content. Migration 0008 removes the old shared media rows/links, so do not run all pending migrations on existing editorial data without resolving that earlier migration's data loss and backup requirements first. Inspect target database and pending migrations before deployment.

Local activation on 20 October 2026: the user approved backing up `kuwaitiexperience_dev` and running `node ace migration:run`. Both 0008 and 0009 completed. Verified SQL/uploads backup and checksums: `tmp/backups/kuwaitiexperience-dev-2026-10-20T07-49-03-938Z/`. Existing non-media row counts, including 24 places and one admin account, were preserved. Legacy image links were cleared as approved and must be reattached in the CMS. Forty-five live read-only HTTP checks passed after migration. Production remains unchanged.

CMS entry points are each place's **Explore details** link, **Place features**, **Movies**, and **Showtimes**. Populate verified phones, hours, stay times, theater screen counts, feature labels and licensed posters. Staff maintain dated theater sessions; no external cinema feed is configured. Public sessions exclude expired/cancelled/unpublished content. Keep host/DB clocks synchronized; dates are interpreted in `Asia/Kuwait` and API showtimes are UTC ISO timestamps.

Movie posters are owned private Drive keys and participate in publication-aware delivery, reference checks, deletion and `images:prune-orphans`. Back up uploads with the database. Customer bookmark state is private and responses use no-store; customer deletion cascades saves. Content reset knows the new dependency order but must never be run just to enable these features. See [Explore integration](explore-api.md), [OpenAPI](explore-openapi.json) and [Postman instructions](postman/README.md).
