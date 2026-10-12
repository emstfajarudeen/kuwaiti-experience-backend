# Database recovery investigation

## Summary answer

The configured application currently targets **`kuwaitiexperience_test`**, not a development database. Its application schema and data are gone: only `adonis_schema` and `adonis_schema_versions` remain, with 0 and 1 rows respectively. All six project migrations are reported as pending, so `users`, `rate_limits`, content tables, and every other application table are currently absent. This directly explains the reported missing `rate_limits` table.

No project dump, backup archive, or Git-tracked SQL/database export was found. The only actual recovery lead found is the local MySQL binary-log set at `D:\laragon\data\mysql-8\binlog.000111` through `binlog.000119`. It contains destructive `DROP TABLE` activity against `kuwaitiexperience_test` on 2026-10-12 (including `category_types` at 15:20:07 and again at 15:22:20, India Standard Time), plus earlier schema/data history. Binary logs may permit a specialist point-in-time reconstruction **only into a separate recovery database/server**; they are not a verified backup and cannot be assumed to contain the user's original editorial records.

**Prerequisite decision:** confirm whether the lost data was expected to be in `kuwaitiexperience_test`, or provide the real original database name/server and any external MySQL/upload backup. Do not run migrations, seeders, resets, or tests against the current server until the binary logs and data directory have been copied safely.

## Evidence

### Configured target and current state

- `.env` configures `DB_DATABASE=kuwaitiexperience_test` (value inspected without recording credentials). `config/database.ts` passes `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_DATABASE` directly to the MySQL connection (`config/database.ts:8-16`).
- A read-only MySQL metadata query connected to `kuwaitiexperience_test` and found only:
  - `adonis_schema` — 0 rows
  - `adonis_schema_versions` — 1 row
- `node ace migration:status` reported every project migration as pending:
  - `1758943358073_create_users_table`
  - `1760000000001_create_auth_tables`
  - `1760000000002_create_content_tables`
  - `1760000000003_create_rate_limits_table`
  - `1760000000004_create_category_types`
  - `1760000000005_link_category_types`
- This is missing-schema evidence, not merely missing records. In particular, the `rate_limits` migration is pending, so the application cannot find that table.
- The local MySQL data directory contains `D:\laragon\data\mysql-8\kuwaitiexperience_test\` with only `adonis_schema.ibd` and `adonis_schema_versions.ibd`. No `kuwaitiexperience_dev` or other directory matching `kuwait`/`experience` was present there.

### Destructive operation evidence

- The retained binary logs are `binlog.000111` through `binlog.000119`; non-empty history is retained from 2026-10-08 through 2026-10-12.
- `mysqlbinlog --database=kuwaitiexperience_test` showed project table creation events followed by table drops. One confirmed event is `DROP TABLE category_types` at `2026-10-12 15:20:07` IST, followed by another at `15:22:20` IST. The same retained history includes drops for `rate_limits`, `users`, auth, media, categories, places, pages, settings, transport, and audit tables.
- The logs also contain repeated `TRUNCATE` events for project tables. The exact initiating command/process cannot be proven from the binary log alone, but these events are consistent with a test/reset/migration rollback workflow rather than an ordinary CMS design update.
- `commands/content_reset.ts:7-26, 57-65` would delete content tables and non-admin users but intentionally does **not** drop the table schema. Therefore the observed absence of all tables requires a separate schema-drop/rollback/test cleanup action in addition to (or instead of) that command.

### Backup and restore-source evidence

- No Git-tracked `*.sql`, `*.dump`, `*.bak`, `*.zip`, `*.gz`, or `*.7z` database export exists (`git ls-files` check).
- No project-specific dump/archive was found under `D:\laragon\www\kuwaiti-experience-backend`. Conventional locations `D:\laragon\data\backup`, `D:\laragon\backups`, `D:\laragon\www\backups`, `D:\backups`, and `C:\laragon\data\mysql` were absent. A broader nearby workspace scan found only unrelated projects' SQL/archive files; none were identified as Kuwaiti Experience data.
- Git history has only one reachable initial-handover commit (`b1a473a`), with no deleted database dump or prior content snapshot.
- `storage/uploads` is Git-ignored (`.gitignore:15-16`) and is not a database restore source. Operations documentation requires backing it up together with MySQL (`docs/operations.md:5-8`); no corresponding upload backup was located in the inspected conventional paths.

### Why seeders are not recovery

- `database/seeders/demo_seeder.ts:6-20, 78-223` creates named demo places, placeholder images, sample categories, transport locations, draft pages, and explicitly labelled demo copy. It is not an export of prior CMS content.
- `database/seeders/admin_seeder.ts:7-43` creates/updates only the configured administrator, and ordinary seeding does not change an existing password.
- README documents that demo seeding creates placeholder content and must not be used as proof of real visitor/editorial information (`README.md`, “Run locally for the first time”, step 4; and “Data management and checks”).

## Conclusions

1. The current configured **test** database is structurally empty apart from migration metadata. This is confirmed by direct read-only metadata and row-count checks.
2. The investigation did not find an ordinary backup/dump from which original data can be restored immediately.
3. The retained local binary logs are a real, time-limited recovery candidate for the `kuwaitiexperience_test` database. They document destructive schema operations and may contain prior row writes, but recovery quality cannot be guaranteed without examining/replaying them in isolation and without knowing whether the original content ever lived in this test database.
4. No evidence establishes that demo seeder content matches the user's original data. Running it would create new placeholder data, not restore records.

## Safe next steps (do not execute until approved)

1. **Preserve evidence first:** stop destructive/test activity and copy the entire `D:\laragon\data\mysql-8` data directory and `binlog.000111`–`binlog.000119` to offline storage using MySQL-safe backup procedures. Binary logs may be purged/overwritten by normal server operation.
2. **User decision needed:** identify the original source: (a) was it `kuwaitiexperience_test`; (b) was it a different development/production database or server; or (c) does a hosting-provider/MySQL backup exist? Supply the database/server name and the desired recovery point in time.
3. **If the test database contained the lost records:** have a MySQL recovery specialist inspect the binary logs and replay a selected point-in-time range only into a newly created isolated recovery database. Validate recovered table/row counts and editorial records there before any controlled import. Never replay logs into `kuwaitiexperience_test` directly.
4. **If original content was in another database:** obtain its MySQL logical/physical backup and the matching `storage/uploads` backup. Restore both to an isolated recovery environment and verify media references before promoting any data.
5. **Only after recovery/source confirmation:** apply the required migrations to a confirmed target and restore/import validated data. Do not run `node ace db:seed`, `node ace content:reset`, migration rollback, or the functional test suite as a substitute for recovery.

## Investigation boundaries

This was a read-only investigation. No migrations, seeders, resets, MySQL write queries, file changes outside this report, commits, or server restarts were performed. Database credentials and secret values were not recorded.
