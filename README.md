# The Kuwaiti Experience

AdonisJS 7, TypeScript, MySQL backend and browser-based admin CMS for a Kuwait discovery guide. The public website screens are supported by `/api/v1`; this repository does not render the public website itself. The CMS is available at `/admin`.

## What is implemented

- Place, category, category-type, static-page, homepage, media, transport-location, and site-settings management in a navy/ivory/gold CMS inspired by the supplied screenshots. Category types can be added or deleted in the CMS; deletion is blocked while categories or places use a type.
- Public landing page, listing, detail, category, page, site, and cab-enquiry-link APIs. The landing page returns category type tiles and published places selected as featured in the place editor. The cab action creates a WhatsApp enquiry link; it does **not** confirm a booking or charge a fare.
- Admin JWT bearer API and HttpOnly-cookie CMS sessions. Access tokens last 15 minutes; hashed, rotating refresh tokens last up to seven days. Logout and password changes revoke sessions.
- Private local image uploads with image decoding/re-encoding, publication-aware public delivery, and reference-safe deletion.
- Reversible MySQL migrations, idempotent admin/demo seeders, an admin-preserving content reset command, and tests against a separate MySQL test database.

The screenshot is a visual reference for the public site, not an admin screenshot. CMS colors and layout follow its design language; exact brand fonts, original logo, photos, and phone mockups were not supplied. Demo images are labeled placeholders, and demo prices/hours are not asserted as real visitor information.

## Requirements

- Node.js 24 or newer, npm 11 or newer, and a running MySQL 8 or newer server. Check with `node --version`, `npm --version`, and `mysql --version`.
- Access to a MySQL account that can create databases and users for initial setup.
- A writable local upload directory. The app writes to `storage/uploads`; tests use `storage/test-uploads`. These directories are created when needed.

## Run locally for the first time

Run these commands from the repository root. The shell examples use macOS/Linux syntax; use the equivalent environment-variable syntax on Windows.

1. Install the locked dependencies:

   ```sh
   npm ci
   ```

2. Create development and test databases. In a MySQL administrator session (`mysql -u root -p`, or your server's equivalent), run the following SQL. Replace the sample password and use the same credentials in `.env`:

   ```sql
   CREATE DATABASE kuwaitiexperience_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE kuwaitiexperience_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'kuwaitiexperience'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-database-password';
   GRANT ALL PRIVILEGES ON kuwaitiexperience_dev.* TO 'kuwaitiexperience'@'127.0.0.1';
   GRANT ALL PRIVILEGES ON kuwaitiexperience_test.* TO 'kuwaitiexperience'@'127.0.0.1';
   ```

   If these databases or the user already exist, reuse them instead of rerunning the creation statements. The grants are scoped to these two databases so migrations and tests can create and remove tables. If MySQL runs on another host or in a container, adjust the user host and `DB_HOST` accordingly.

3. Create the local configuration:

   ```sh
   cp .env.example .env
   node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
   node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
   ```

   Put the **two different outputs** in `.env` as `APP_KEY` and `JWT_SECRET`. Set `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` to match MySQL. Keep `DB_DATABASE=kuwaitiexperience_dev`, `APP_URL=http://localhost:3333`, and `PORT=3333` for the defaults below. `.env` is ignored by Git; never commit its secrets. `.env.test` supplies test-only overrides, including `DB_DATABASE=kuwaitiexperience_test`, while the remaining values come from `.env`.

4. Create the schema and initial administrator. Choose your own email and a unique password of at least 14 characters:

   ```sh
   node ace migration:run
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-a-unique-password-of-14-or-more-characters' node ace db:seed
   ```

   `db:seed` creates the administrator and sample content, including placeholder images. The demo seeder is for local development only. The admin seeder is idempotent and will not change an existing password. The inline password is used for this command only; avoid leaving it in `.env` or shell history. If your shell saves commands, supply the password through a safer environment or secret manager instead of typing it inline.

5. Start the server and check both entry points:

   ```sh
   npm run dev
   ```

   Open `http://localhost:3333/admin/login` and sign in with the administrator credentials. In another terminal, run `curl http://localhost:3333/api/v1/health`; it should return `{"data":{"status":"ok"}}`. The repository contains the CMS and API; the public website is a separate frontend.

## Tests and routine commands

The functional suite uses `.env.test` and **must** have its own `kuwaitiexperience_test` database. It migrates the test database and changes its data. Never point it at development or production data.

```sh
node ace test functional
npm run typecheck
npm run lint
npm run build
```

After changing migrations, rerun `node ace migration:run` for the development database. `npm run build` compiles the server and CMS assets into `build/`. For a production deployment, configure production values for `NODE_ENV`, `APP_URL`, secrets, database, and upload storage. From `build/`, run `npm ci --omit=dev`, apply migrations with `node ace migration:run`, and seed **only** the administrator with `node ace db:seed --files database/seeders/admin_seeder.ts` if one does not already exist. Start with `npm start` (equivalent to `node bin/server.js`). Run migrations as a controlled release step before serving traffic. The demo seeder refuses production. Persist and back up both MySQL and `storage/uploads`; see [operations](docs/operations.md) for deployment and recovery details.

For an intentional **development or test** password reset, set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then run `ADMIN_SEED_RESET_PASSWORD=true node ace db:seed --files database/seeders/admin_seeder.ts`. This one-time path permits an eight-character local password, replaces the configured admin's hash, and revokes that admin's sessions. It is disabled in production; omit the flag for normal idempotent seeding.

## If startup fails

- **Database connection error:** Check that MySQL is running and the `.env` `DB_*` values match the user, host, and database grants. Then retry `node ace migration:run`.
- **Missing or invalid environment variable:** Compare `.env` with `.env.example`; replace both secret placeholders with independent random values. For tests, keep `.env.test` and the test database name intact.
- **Admin login fails:** Confirm that the seed command completed and that you are using the email and password supplied to it. An existing administrator is not overwritten by ordinary seeding.
- **CMS assets or uploads are missing:** Keep the development server running while using the CMS; confirm the app can write to `storage/uploads`. For a built deployment, use the generated `build/` assets and persistent upload storage.
- **SWC native binding cache permission error:** Set `SWC_NATIVE_BINDING_CACHE` to a writable directory (for example, `/tmp/swc-cache`) for the failing command, then retry it.

## API and authentication

The public JSON API starts at `/api/v1`. For example:

```text
GET /api/v1/home?locale=en
GET /api/v1/categories?type=attraction
GET /api/v1/places?type=attraction&category=parks&page=1&perPage=12
GET /api/v1/places/kuwait-towers
POST /api/v1/transport/enquiry-link
```

CMS JSON clients log in with `POST /api/v1/admin/auth/login`, send `Authorization: Bearer <accessToken>` to protected `/api/v1/admin/*` routes, and rotate through `/auth/refresh`. Browser CMS forms use SameSite/HttpOnly cookies and CSRF protection. API routes deliberately accept bearer authentication only; do not send CMS cookies with an API request. All JSON failures use `{ "error": { "code", "message", "requestId", "fields"? } }`. Full routes and request shapes are in [OpenAPI](docs/openapi.yaml).

Example public responses for frontend integration are in [Frontend API responses](docs/frontend-api-responses.md).

`GET /api/v1/home` is the landing-page payload: hero, ordered category type tiles, published places marked “Feature on homepage” in the place editor, and app store links from site settings. App promotion copy and artwork are static frontend content and are not managed in the Homepage CMS.

## Data management and checks

```text
node ace content:reset --dry-run
node ace content:reset --confirm=kuwaitiexperience_dev
node ace media:prune-orphans
node ace media:prune-orphans --delete
npm run typecheck
npm run lint
node ace test functional
npm run build
```

`content:reset` removes all content, media, sessions, non-admin users, and rate-limit records, while preserving admin rows and password hashes. It refuses unexpected database names and requires an exact `--confirm` value; production also requires `--force-production`. This action is irreversible without a backup. The command deletes managed files after the database commit, and `media:prune-orphans` handles partial file cleanup. Never point tests at a non-test database: the test runner explicitly rejects names other than `kuwaitiexperience_test`.

## Structure

```text
app/controllers/admin/        Edge CMS pages and form handling
app/controllers/api/          Public and admin JSON endpoints
app/middleware/               JWT admin gate
app/services/                 Auth, publication/query and content writes
app/validators/               VineJS input rules
database/migrations/          Ordered, reversible MySQL schema
database/seeders/             Admin and demo fixtures
commands/                     Reset and orphan cleanup
resources/views/admin/        CMS screens
resources/css/admin.css       CMS design system
docs/                         API and operations
tests/functional/             MySQL-backed API and CMS checks
```

Open questions for launch: approved venue copy, prices and hours; licensed photography and original brand assets; the intended meaning of “Schedule”; the real WhatsApp number; and public-site/mobile implementation. Those are intentionally not invented here.
