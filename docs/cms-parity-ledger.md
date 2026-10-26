# CMS React + Inertia parity ledger

Local implementation status: 23 October 2026. The existing `/admin` URLs, cookie authentication, CSRF checks, server validators, write services, audit calls, and redirects remain in place. All reachable admin GET handlers render Inertia pages. The former Edge templates remain in the repository as rollback reference.

| Module                     | React page / routes                                                                                                    | Local verification                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Authentication and account | `auth/login`, `auth/account`; login, refresh, account, logout                                                          | `cms_auth_inertia.spec.ts`, `admin_auth.spec.ts`, dashboard browser sign-in           |
| Dashboard                  | `dashboard/overview`; `/admin`                                                                                         | `cms_dashboard_inertia.spec.ts`, `cms_dashboard.spec.ts`                              |
| Contact requests           | `contacts/index`, `contacts/show`; inbox/detail/status                                                                 | `cms_contacts_inertia.spec.ts`, `cms_contacts.spec.ts`                                |
| Save-success               | `save_success/show`; timed return                                                                                      | `cms_save_success_inertia.spec.ts`, `cms_save_success.spec.ts`                        |
| Categories                 | `categories/index`, `categories/edit`; filter/create/edit/delete                                                       | `cms_pages.spec.ts`, `cms_content_migration.spec.ts`                                  |
| Category types             | `category_types/index`, `category_types/edit`; create/edit/image/delete                                                | `category_types.spec.ts`, `entity_images.spec.ts`, `cms_content_migration.spec.ts`    |
| Static pages               | `pages/index`, `pages/edit`; bilingual Quill body, publish/archive/delete                                              | `cms_pages.spec.ts`, `customer_accounts.spec.ts`, `cms_content_migration.spec.ts`     |
| Places                     | `places/index`, `places/edit`, `places/preview`; search/filter/pagination, draft/publish/archive/delete, cover/gallery | `content_lifecycle.spec.ts`, `entity_images.spec.ts`, `cms_content_migration.spec.ts` |
| Explore place              | `explore/place`; features, weekly hours, split and overnight intervals                                                 | `explore.spec.ts`, `cms_content_migration.spec.ts`                                    |
| Place features             | `explore/features`; create/edit/delete, assignment constraints                                                         | `explore.spec.ts`, `cms_content_migration.spec.ts`                                    |
| Movies                     | `explore/movies`, `explore/movie`; status, poster, delete constraints                                                  | `explore.spec.ts`, `cms_content_migration.spec.ts`                                    |
| Showtimes                  | `explore/showtimes`; create/edit/delete, Kuwait local input to UTC, venue filter                                       | `explore.spec.ts`, `cms_content_migration.spec.ts`                                    |
| Homepage                   | `site/home`; English/Arabic hero content, image, Explore cards                                                         | `public_content.spec.ts`, `entity_images.spec.ts`, `cms_content_migration.spec.ts`    |
| Transport                  | `site/transport`; create/edit/delete, pickup/drop-off flags                                                            | `public_content.spec.ts`, `cms_content_migration.spec.ts`                             |
| Site settings              | `site/settings`; branding, logo, contact and app links                                                                 | `public_content.spec.ts`, `entity_images.spec.ts`, `cms_content_migration.spec.ts`    |

## Local release checks

- `node ace test functional`: 60/60 passed.
- `node ace test browser`: 9/9 passed. The new content suite covers five browser flows and the prior suite covers dashboard, contacts, and save-success.
- `npm run typecheck`, `npm run lint`, and `npm run build`: passed after the final local changes.
- Production build smoke: server returned a server-rendered `/admin/login` page with status 200 on a temporary localhost port.
- No database migration or public API contract change was needed. Existing functional tests exercise public API behavior and image ownership.

## Release activities outside this local checkout

Staging editorial acceptance, representative desktop/mobile visual comparison against the old release, rollback rehearsal with the prior build, and production deployment monitoring still need to be completed before a production cutover. These are deployment gates, not additional CMS modules.
