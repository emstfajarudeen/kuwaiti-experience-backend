---
inclusion: auto
name: Development, testing, and operations
description: Use when installing, running, testing, building, deploying, resetting data, or updating project documentation.
---
# Development, testing, and operations

- Use Node.js 24+, npm 11+, and MySQL 8+. Install locked dependencies with `npm ci`; copy `.env.example` to `.env`, generate independent `APP_KEY` and `JWT_SECRET`, and keep development and test databases separate.
- Routine commands are `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `node ace test functional`, and `npm run build`. Before release, run typecheck, lint, functional tests, and build. Tests require the exact `kuwaitiexperience_test` database and isolated `storage/test-uploads`; never point them at development or production data.
- Apply schema with `node ace migration:run`. Use `node ace db:seed` for configured seeders and run the demo seeder only in non-production environments. The admin seeder is idempotent; intentional development/test password reset requires its documented reset flag and must not be enabled in production.
- Treat `node ace content:reset` as destructive and irreversible without backup: inspect with `--dry-run`, require the exact database confirmation, and use `--force-production` only for an explicitly approved production reset. Use `media:prune-orphans` after incomplete file cleanup.
- Production builds use `npm run build` and `npm start` (`node bin/server.js`), with persistent `storage/uploads`, controlled migrations before traffic, and MySQL plus uploads backed up together. Multi-instance deployment requires shared storage or a different Drive adapter.
- Keep operational and API documentation aligned with verified behavior. Record unresolved launch inputs (approved content, licensed media, WhatsApp/store URLs, Arabic copy, and Schedule meaning) rather than inventing values. Review `docs/operations.md` before dependency or deployment changes and do not use `npm audit fix --force` without compatibility review.
