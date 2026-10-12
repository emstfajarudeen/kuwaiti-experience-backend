# Operations

## Configuration

Use `.env.example` as the variable list. `APP_KEY` and `JWT_SECRET` must be independent random secrets. Keep MySQL credentials, initial admin password, and both secrets out of source control. `LIMITER_STORE=database` is recommended for deployed instances; `memory` is used by the isolated test environment. Application timestamps are UTC, while cab enquiry input is interpreted in `Asia/Kuwait`.

The local Drive disk stores files in `storage/uploads`. Keep this directory on persistent storage and back it up with the MySQL database. One writable application instance is the safe starting topology for local disk; multi-instance deployment needs shared storage or a storage adapter change. Serve media through the app routes, not a public static alias. Public media responses can remain cached for up to 60 seconds after publication changes.

## First administrator

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 14 characters) for the initial seeder run. Ordinary seeding inserts only when the email is absent and will not reset an existing credential. Remove `ADMIN_PASSWORD` from the environment afterward. The administrator can change the password at `/admin/account`, which revokes every active session.

For a one-time development/test reset through the seeder, set `ADMIN_PASSWORD` and run `ADMIN_SEED_RESET_PASSWORD=true node ace db:seed --files database/seeders/admin_seeder.ts`. The reset requires at least eight characters, replaces only the configured admin's password hash, and revokes that admin's sessions. It refuses production. Do not leave the reset flag set for routine seeding.

## Schema changes and rollback

Apply `node ace migration:run` before serving a release. On a disposable test database, `node ace migration:rollback` reverts the latest batch; the functional test runner also migrates and rolls back all four initial migrations. Back up live data before a migration because `down()` drops tables and their contents. Never use schema rollback as a content reset.

## Content reset

1. Make a coordinated MySQL plus upload-directory backup and pause writes.
2. Run `node ace content:reset --dry-run` and inspect the database name, admin IDs, and table counts.
3. Run `node ace content:reset --confirm=<exact-DB_DATABASE>`. Production additionally requires `--force-production`.
4. If file cleanup reports a failure, run `node ace media:prune-orphans`, inspect its list, then `node ace media:prune-orphans --delete`.
5. Verify admin login and empty public APIs. Demo data can be reseeded in non-production environments.

The reset performs FK-ordered deletes in a transaction and preserves admin user rows/password hashes and migration metadata. It revokes all sessions. The file deletion occurs after commit, so preserve the backup until cleanup has been checked. Do not run test and development environments against the same database; their upload directories are already separated.

## Health and validation

`GET /api/v1/health` confirms the HTTP app is running. Run `npm run typecheck`, `npm run lint`, `node ace test functional`, and `npm run build` before release. Functional tests require `kuwaitiexperience_test`; the runner refuses another name. The dashboard shows content counts and recent audit actions, not fabricated traffic metrics.

The 9 October 2026 production dependency audit reports 18 high-severity entries cascading from an upstream `braces` advisory through AdonisJS tooling. The latest published `braces` version checked was 3.0.3, and npm's automatic fix proposes incompatible framework downgrades. Review this advisory and upstream releases before a public production launch; do not use `npm audit fix --force` without a migration and regression review.

## Pending production inputs

Replace demo placeholders with licensed photos and approved content. Confirm actual entry prices, opening hours, transport destinations, WhatsApp number, app-store URLs, Arabic copy, and the meaning of the navigation item “Schedule.” The current enquiry endpoint only produces a link and does not store reservations or imply availability.
