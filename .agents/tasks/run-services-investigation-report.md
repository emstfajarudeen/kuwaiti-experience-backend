# Local CMS, API, and website run investigation

## Summary answer

This repository can run one AdonisJS process that serves both the browser CMS and the backend JSON APIs:

- CMS: `http://localhost:3333/admin/login` after `npm.cmd run dev`; the authenticated CMS is under `/admin`.
- Visitor-facing backend API: `http://localhost:3333/api/v1`, including the non-authenticated health check `GET /api/v1/health`.
- Public website: not present in this repository. The repository supplies API responses for a separate frontend, but it does not contain or render the visitor website. Do not expect a second website process or a public visual site URL from this project.

Before startup, install Node dependencies, ensure MySQL 8+ is running, configure `.env` with independent secrets and development database credentials, apply migrations, and create an administrator. The application writes local media to `storage/uploads`, so that directory must be writable. This investigation did not start, restart, migrate, seed, or modify any service or file other than this report.

## Evidence

### Runtime and commands

- `package.json` declares Node `>=24.0.0`; scripts are `dev: node ace serve --hmr`, `start: node bin/server.js`, `build: node ace build`, and `test: node ace test`.
- `bin/server.ts` is the HTTP entrypoint and loads `start/env.ts` before starting Adonis. `start/env.ts` requires `NODE_ENV`, `PORT`, `HOST`, `APP_URL`, `APP_KEY`, `JWT_SECRET`, and the MySQL `DB_*` variables among others.
- `start/routes.ts` registers the CMS, public API, and admin API routes in the same process. `GET /` redirects to `/admin`; it is not a visitor website landing page.
- `start/kernel.ts` installs static-file and Vite middleware plus body parsing, sessions, and Shield. Vite entrypoints are configured in `vite.config.ts` as `resources/css/admin.css` and `resources/js/app.js`; development mode is therefore the correct way to serve the CMS assets with HMR.
- `node ace list:routes` completed successfully without starting the HTTP server and showed the expected route inventory.

Observed local tool preflight:

- `node --version` returned `v24.18.0`.
- `mysql --version` returned MySQL `8.0.30`.
- `npm.cmd --version` returned `11.16.0`.
- In this PowerShell environment, `npm --version` was blocked because `npm.ps1` is not digitally signed. Use `npm.cmd` in the commands below, or resolve the local PowerShell execution-policy issue separately. This is not an application error.

### CMS routes

`start/routes.ts` declares public login routes `GET /admin/login`, `POST /admin/login`, and `POST /admin/refresh`. The protected group is prefixed `/admin` and uses `middleware.jwtAdmin()`; it includes dashboard, places, categories, category types, pages, media, homepage, settings, transport, logout, and account/password routes.

The expected browser entrypoint is:

```text
http://localhost:3333/admin/login
```

After login, the CMS redirects to `/admin`. Browser CMS forms use HttpOnly cookies and Shield CSRF protection; use the rendered form rather than sending arbitrary form POSTs.

### Public and admin API routes

`start/routes.ts` declares the public API group under `/api/v1`:

- `GET /api/v1/health`
- `GET /api/v1/home`
- `GET /api/v1/site`
- `GET /api/v1/categories`
- `GET /api/v1/places`
- `GET /api/v1/places/:slug`
- `GET /api/v1/pages/:slug`
- `GET /api/v1/transport/locations`
- `POST /api/v1/transport/enquiry-link`
- `GET /api/v1/media/:id`

The same file declares bearer-authenticated admin JSON routes under `/api/v1/admin`, including login/refresh, dashboard, content, media, settings/home, and transport-location management. JSON admin requests must use `Authorization: Bearer <accessToken>`; the project documentation says not to send CMS cookies to API routes.

Safe HTTP smoke checks after startup are:

```powershell
curl.exe http://localhost:3333/api/v1/health
curl.exe -I http://localhost:3333/admin/login
```

The health response should be:

```json
{"data":{"status":"ok"}}
```

The health endpoint confirms that HTTP is responding; it does not verify database health.

### Website boundary

`README.md` states that the public website screens are supported by `/api/v1`, while the public website itself is outside this repository. `PROJECT_GUIDE.md` section 1 repeats that the repository contains the Edge-rendered administrative CMS and versioned JSON API, not the public visitor frontend. The guide's known gaps also list the public frontend as outside the repository.

Therefore this repository can start the CMS and API backend only. A separate frontend repository or deployment must consume URLs such as `/api/v1/home`, `/api/v1/places`, and `/api/v1/site`; no command in this repository starts that visitor website.

## Required prerequisites and configuration

1. Node.js 24+, npm 11+, and MySQL 8+. The observed machine meets those versions. In PowerShell, prefer `npm.cmd` because the local `npm.ps1` shim is blocked.
2. A MySQL server reachable at the configured host and port, normally `127.0.0.1:3306`.
3. Separate development and test databases. The README specifies `kuwaitiexperience_dev` and `kuwaitiexperience_test`, with a user granted access to both. Never run tests against development or production data.
4. A writable `storage/uploads` directory. Tests use `storage/test-uploads`.
5. `.env` copied from `.env.example`, with two different random values for `APP_KEY` and `JWT_SECRET`, correct `DB_*` values, `APP_URL=http://localhost:3333`, and `PORT=3333`. Do not expose or commit the existing `.env` contents.
6. The schema must be applied with `node ace migration:run` before the first server run. The first administrator must be created with process-only `ADMIN_EMAIL` and `ADMIN_PASSWORD`; the password is operator-selected and is not defined by the repository.

The database configuration in `config/database.ts` uses Lucid's `mysql2` connection with the `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_DATABASE` environment values. Migrations are read from `database/migrations`.

## Exact Windows PowerShell setup and run commands

Run from the repository root:

```powershell
Set-Location 'D:\laragon\www\kuwaiti-experience-backend'
node --version
npm.cmd --version
mysql --version
npm.cmd ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the two different outputs into `.env` as `APP_KEY` and `JWT_SECRET`, then set the database credentials. If the databases/user do not exist, an administrator can create them in MySQL:

```sql
CREATE DATABASE kuwaitiexperience_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE kuwaitiexperience_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kuwaitiexperience'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-strong-database-password';
GRANT ALL PRIVILEGES ON kuwaitiexperience_dev.* TO 'kuwaitiexperience'@'127.0.0.1';
GRANT ALL PRIVILEGES ON kuwaitiexperience_test.* TO 'kuwaitiexperience'@'127.0.0.1';
```

After `.env` is configured:

```powershell
node ace migration:run
$env:ADMIN_EMAIL = 'admin@example.com'
$env:ADMIN_PASSWORD = 'choose-a-unique-password-of-14-or-more-characters'
node ace db:seed
Remove-Item Env:ADMIN_EMAIL
Remove-Item Env:ADMIN_PASSWORD
npm.cmd run dev
```

Use a real unique password instead of the documentation placeholder. Ordinary seeding does not overwrite an existing administrator password. `db:seed` runs configured seeders and the demo content is for non-production/local use only. The command is intentionally not run as part of this read-only investigation.

Open the CMS at:

```text
http://localhost:3333/admin/login
```

In a second PowerShell window:

```powershell
Set-Location 'D:\laragon\www\kuwaiti-experience-backend'
curl.exe http://localhost:3333/api/v1/health
```

For a built deployment rather than development/HMR:

```powershell
npm.cmd run build
npm.cmd start
```

`npm start` runs `node bin/server.js` and requires the built output plus runtime dependencies and persistent upload storage. Use `npm.cmd start` in this PowerShell environment.

## Safe preflight checks

These checks do not modify data or start the server:

```powershell
node --version
npm.cmd --version
mysql --version
node ace list:routes
```

Before migrations or seeding, verify manually that:

- MySQL is running and accepts the configured account; use a read-only connection check such as `mysql -h 127.0.0.1 -P 3306 -u kuwaitiexperience -p -e "SELECT VERSION();"` and do not include the password in the command line.
- `.env` points to `kuwaitiexperience_dev`, not `kuwaitiexperience_test` or production, for local development.
- `APP_KEY` and `JWT_SECRET` are present and independent.
- `storage/uploads` is writable.
- The test environment remains separate; `.env.test` overrides `DB_DATABASE=kuwaitiexperience_test`, `SESSION_DRIVER=memory`, and `LIMITER_STORE=memory`.
- `node ace migration:run` is run only after confirming the selected database and backup policy.

For non-mutating application validation after a process is already running, use the health request above. Do not use `content:reset`, `media:prune-orphans --delete`, migration rollback, or test commands against the development database as a preflight; those can alter data or filesystem contents.

## Conclusions and recommendations

1. Start `npm.cmd run dev` once MySQL, `.env`, migrations, and an administrator are ready. This single process provides both CMS and API endpoints.
2. Do not look for a website start command in this repository. Obtain and run the separate public frontend, configuring it to consume this backend's `/api/v1` origin.
3. The documented health endpoint is an HTTP check only. Add a separate operational database/readiness check if deployment needs to distinguish an available HTTP process from a usable database, but do not implement that as part of this investigation.
4. Keep real admin credentials, secrets, uploaded media, and `.env` outside source control. The initial admin password must be supplied by the operator and cannot be recovered from source.
5. The current investigation did not run migrations, seeders, `npm.cmd run dev`, or `npm.cmd start`, so it does not claim that the local database is currently initialized or that a server is currently running.

## Source citations

- `README.md`: Requirements; Run locally for the first time; Tests and routine commands; API and authentication; Structure; Open questions for launch.
- `PROJECT_GUIDE.md`: Sections 1, 3, 4, 5, 9, 12, 13, 15, and 16.
- `package.json`: `scripts`, `engines`, and dependency declarations.
- `start/env.ts`: boot-time environment schema.
- `bin/server.ts`: HTTP server entrypoint.
- `start/routes.ts`: CMS, public API, and admin API route registration.
- `start/kernel.ts`: global and router middleware.
- `config/database.ts`: MySQL connection and migration configuration.
- `vite.config.ts` and `config/vite.ts`: CMS asset entrypoints and Vite output.
- `.env.example` and `.env.test`: local/test configuration defaults and overrides.
- `docs/operations.md`: administrator setup, migrations, health validation, uploads, and deployment constraints.
- `docs/openapi.yaml`: documented API endpoint inventory and request/response contracts.
