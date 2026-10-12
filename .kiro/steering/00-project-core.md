---
inclusion: always
---
# Project core

- This is a private AdonisJS 7 / TypeScript modular monolith backed by MySQL. It contains the Edge-rendered admin CMS at `/admin` and the visitor-facing JSON API at `/api/v1`; the public website itself is outside this repository.
- Treat current routes, controllers, services, validators, migrations, seeders, tests, and configuration as implementation authority. Use [PROJECT_GUIDE.md](../../PROJECT_GUIDE.md), [README.md](../../README.md), [docs/openapi.yaml](../../docs/openapi.yaml), and [docs/operations.md](../../docs/operations.md) for context, but verify contracts against source when they differ.
- Keep changes scoped to the requested behavior. Do not invent booking, payment, live availability, customer-account, native-app, or public-frontend features: they are not implemented here.
- Preserve the current layering: routes select controllers; validators handle request shape; services own shared authentication/content/media/write behavior; controllers return JSON or render Edge views. Current data access uses Lucid's `db` query builder directly; there are no application model classes.
- Follow the repository's TypeScript/ESLint/Prettier conventions, use the existing `#` import aliases where practical, and avoid unrelated refactors. Do not commit secrets, `.env` files, uploads, or demo content as real editorial data.
