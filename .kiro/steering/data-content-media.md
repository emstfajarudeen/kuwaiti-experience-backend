---
inclusion: auto
name: Data, content, and media rules
description: Use when changing migrations, database queries, content lifecycle, seeders, uploads, media delivery, or editorial workflows.
---
# Data, content, and media rules

- Schema changes belong in ordered Lucid migrations under `database/migrations`. Respect existing foreign keys and localized translation tables. Migrations are destructive on rollback; back up live MySQL data before production schema operations and never use rollback as a content reset.
- Write operations should use the existing transaction pattern and audit behavior. Preserve reference protections: categories/types, media, and content cannot be deleted or changed when dependent records make that unsafe. Keep admin users and password hashes protected from content-reset behavior.
- Use the current content lifecycle: draft -> published -> archived, with publication requiring the existing completeness rules. Public queries must retain publication and visibility filters. Demo seed data is explicitly placeholder content and must not be presented as verified visitor information.
- Media is private local Drive storage under `storage/uploads` (tests use `storage/test-uploads`) and is served through authenticated or publication-aware application routes, not a static alias. Accepted source images are JPEG/JPG/PNG/WebP; the current pipeline decodes with Sharp, enforces size/pixel bounds, rotates, and stores UUID-based WebP output.
- Keep media deletion reference-safe and remember database/file deletion are separate operations. Use `node ace media:prune-orphans` for managed orphan cleanup; do not broaden cleanup to arbitrary files. Back up uploads together with the database, and do not assume local storage supports multiple application instances.
- Preserve editorial and localization constraints: English required fields remain authoritative for publication, Arabic fields fall back independently where implemented, prices are KWD-shaped decimals formatted to three places, and transport date-times are interpreted in `Asia/Kuwait`. The enquiry endpoint creates a WhatsApp link only; it does not reserve or confirm a booking.
