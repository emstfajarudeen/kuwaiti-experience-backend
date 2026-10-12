# Admin credentials investigation report

## Summary answer

- **Seeded admin email/username:** `admin@example.com` in the currently configured local database (`kuwaitiexperience_test`). The project has no separate username field; authentication uses email.
- **Password:** Not recoverable from the repository or database. `AdminSeeder` accepts the password from the process-only `ADMIN_PASSWORD` variable and stores only a scrypt hash. The checked-in documentation uses `admin@example.com` only as an example and does not define a real password.
- **Browser login:** `GET /admin/login` displays the CMS login form; `POST /admin/login` authenticates and redirects to `/admin`.
- **JSON login:** `POST /api/v1/admin/auth/login` accepts the email/password and returns bearer access and refresh tokens.
- **Are credentials generated?** The email is supplied by the operator and normalized to lowercase; it is not generated. The password is supplied by the operator and hashed; it is not generated or recoverable.
- **Was the seeder run?** Available evidence verifies that the configured test database contains an admin row and that all migrations are applied. It does not provide an execution log proving that `AdminSeeder` itself created the row, although the row's values (`admin@example.com`, admin role, active state, and `must_change_password=1`) are consistent with the seeder's first-create path.

## Evidence

### Seed input and password handling

- `database/seeders/admin_seeder.ts`, `AdminSeeder.run()` reads `process.env.ADMIN_EMAIL` and `process.env.ADMIN_PASSWORD`; it lowercases/trims the email, requires a 14-character password for first creation, hashes it with `hash.make()`, and inserts `full_name: 'Administrator'`, `role: 'admin'`, `active: true`, and `must_change_password: true`.
- The same method returns without changing an existing admin password during ordinary seeding. The optional `ADMIN_SEED_RESET_PASSWORD=true` path replaces the hash only for non-production use, requires at least eight characters, and revokes active sessions.
- `README.md` under “Run locally for the first time” says the operator chooses the email and a unique password of at least 14 characters. Its `admin@example.com` and `choose-a-unique-password-of-14-or-more-characters` values are placeholders, not a recoverable deployed credential.
- `PROJECT_GUIDE.md` sections 3, 4, and 11 and `docs/operations.md` section “First administrator” likewise document operator-provided `ADMIN_EMAIL`/`ADMIN_PASSWORD`; they explicitly state that the password must be removed from the environment after seeding.
- The local `.env` was checked only for relevant non-secret configuration: it has no `ADMIN_EMAIL`, `ADMIN_PASSWORD`, or `ADMIN_SEED_RESET_PASSWORD` entries. Its configured database is `kuwaitiexperience_test`. No `.env` secret values are reproduced here.

### Authentication implementation and paths

- `start/routes.ts` declares `GET /admin/login` and `POST /admin/login`; the POST uses `AdminAuthController.login` and the login throttle. The protected browser CMS group is prefixed `/admin` and uses `jwtAdmin` middleware.
- `app/controllers/admin/auth_controller.ts`, `showLogin()` renders `admin/login`; `login()` validates the email/password, calls `loginAdmin()`, sets HttpOnly `admin_access` and `admin_refresh` cookies scoped to `/admin`, and redirects to `/admin`.
- `start/routes.ts` declares `POST /api/v1/admin/auth/login` within the `/api/v1/admin` group. `app/controllers/api/auth_controller.ts`, `login()` validates the payload, calls `loginAdmin()`, sets `Cache-Control: no-store`, and returns `{ data: tokens }`.
- `app/services/auth_service.ts`, `loginAdmin()` looks up the normalized email in `users`, requires an active admin role, and verifies the submitted password with `hash.verify()`. It stores only a SHA-256 digest of a random refresh token and returns a 15-minute access token plus a seven-day session-backed refresh token.
- `docs/openapi.yaml` documents the JSON endpoint as `POST /api/v1/admin/auth/login` and requires bearer authentication for subsequent admin API requests.

### Database evidence

A read-only MySQL query against the database named by local `.env` (`kuwaitiexperience_test`) returned one admin row with:

- email: `admin@example.com`
- role: `admin`
- active: `1`
- must_change_password: `1`
- created: `2026-10-12 06:19:04`

The password hash was deliberately not queried or exposed. The same database contains the `adonis_schema` table and six applied migration records:

- `database/migrations/1758943358073_create_users_table`
- `database/migrations/1760000000001_create_auth_tables`
- `database/migrations/1760000000002_create_content_tables`
- `database/migrations/1760000000003_create_rate_limits_table`
- `database/migrations/1760000000004_create_category_types`
- `database/migrations/1760000000005_link_category_types`

There are no SQL dumps or SQLite database files in the repository that would provide an independent seeder execution log. The schema has no seeder-history table, so the database can confirm the resulting admin row but not conclusively distinguish `AdminSeeder` insertion from another direct insert.

## Conclusions and recommendations

1. Try `admin@example.com` as the email for the local test database, but do not claim a default password: the source does not define one and the existing hash cannot be reversed.
2. For an intentional development/test reset, set a new temporary `ADMIN_EMAIL` and `ADMIN_PASSWORD` and run `ADMIN_SEED_RESET_PASSWORD=true node ace db:seed --files database/seeders/admin_seeder.ts`. The seeder refuses this reset in production; do not persist the password or reset flag.
3. The normal documented first-time command is `node ace migration:run` followed by `node ace db:seed` with operator-supplied `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Ordinary reruns do not alter the existing password.
4. Alternatively, after signing in, use `/admin/account` (the browser CMS password-change page) or the authenticated API `PATCH /api/v1/admin/auth/password`; both change the password and revoke active sessions. The API requires the current password, so it is not a recovery mechanism when that password is unknown.
