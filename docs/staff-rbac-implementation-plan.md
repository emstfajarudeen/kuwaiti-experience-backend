# Staff Management + Roles & Permissions: implementation handoff

Status: core implementation is in this working tree; typecheck and protected-route inventory passed. Functional/browser suites and a live database migration/seeder run remain to be performed in the isolated test environment.

Repository: `/Users/airm1/Desktop/Emstell/kuwaitiexperience-backend`.

## 1. Execution instructions

Implement the phases below in order. Complete each phase's acceptance criteria before moving on. Use this document as the specification; inspect the referenced files to confirm their current signatures before editing them. Record progress and any deviations in a short checklist at the end of this file so another model can resume without rereading the entire repository.

The working tree already contains substantial uncommitted React/Inertia CMS migration and user/password-reset work. Preserve it. Do not reset, stash, overwrite, or regenerate unrelated files. Start by checking `git status --short` and applicable `AGENTS.md` instructions. Do not commit, push, deploy, or run commands against a production database as part of implementation.

Use the current stack: AdonisJS 7, TypeScript, Lucid query builder, MySQL, React/Inertia, Ant Design, Vine validators, Japa, and the existing browser test setup. Follow existing code conventions. Do not introduce a new authentication provider, ORM, policy engine, or infrastructure dependency. A small typed authorization service and explicit route policy registry are sufficient for this scope.

## 2. Current code and constraints

| Concern | Existing files and behavior |
| --- | --- |
| Admin authentication | `app/services/auth_service.ts`: JWT access tokens, rotating refresh tokens, persisted/revocable sessions; users must have `role = 'admin'` and `active = true` |
| Admin authentication middleware | `app/middleware/jwt_admin_middleware.ts`: authenticates browser cookies or API bearer tokens and attaches `ctx.admin`; checks persisted sessions on requests |
| Route surfaces | `start/routes.ts`: `/admin/**`, `/api/v1/admin/**`, `/api/v2/admin/**`; all three need authorization |
| Existing users | `app/controllers/admin/users_controller.ts`, `app/validators/admin_users.ts`, `inertia/pages/users/{index,edit}.tsx`: CRUD, status, password resets; no granular access checks |
| Account recovery | `app/services/admin_password_reset_service.ts`, `admin_password_reset_mailer.ts`, `app/controllers/admin/auth_controller.ts` |
| User schema | `database/migrations/1758943358073_create_users_table.ts`: name, email, hashed password, legacy account discriminator `role`, active flag, password-change flag |
| Audit storage | `database/migrations/1760000000002_create_content_tables.ts`: `audit_logs` already has actor, action, entity, JSON changed_fields, request_id, timestamp |
| CMS shared data | `app/middleware/inertia_middleware.ts`, `app/types/`, `inertia/layouts/admin_layout.tsx`; current navigation exposes all modules |
| Error handling | `app/services/api_error.ts`, `app/exceptions/handler.ts`; API errors already have an envelope; CMS needs a deliberate 403 page |
| Seeders | `database/seeders/admin_seeder.ts`, `demo_seeder.ts`; admin seeding must not reset credentials during ordinary reruns |
| Tests | `tests/functional/admin_{auth,users,password_reset}.spec.ts`, CMS functional and browser suites; `tests/bootstrap.ts` protects the isolated test database |

Customers use a separate authentication flow. Keep customer/public APIs and their visibility rules intact. Do not interpret `users.role` as the new RBAC role: retain it as the existing CMS account discriminator for compatibility, and put RBAC memberships in new tables.

## 3. Fixed product and security decisions

1. A staff member is an existing CMS `users` account. Staff can have multiple roles; effective permissions are the union of active permissions from those roles. No direct user permission overrides, role inheritance, or explicit deny rules in this version.
2. Roles are global to this CMS. All records in a permitted module are accessible unless an existing business rule imposes a narrower constraint. Tenant, ownership, and per-record assignment rules are outside this version; do not invent tenant scoping.
3. Permissions describe operations, not frontend URLs. Examples: `places.view`, `places.update`, `places.publish`. All browser/API variants of an operation use the same permission.
4. Default deny: an authenticated user with no roles has no module access. Missing policies, unknown permission keys, retired permissions, and database errors never grant access.
5. The protected system roles `administrator` and `super_admin` both have full access to every active catalogue permission, including staff and role administration. Administrator has no module or administrative limitation. Editor and Viewer remain scoped. Only these protected system memberships can administer staff or change roles/memberships; reserve `staff.manage`, `roles.manage`, and `roles.assign` from ordinary roles.
6. Full access is derived from a protected system-role membership, not a request flag or the legacy `users.role` value. The effective set includes all active, code-declared permissions after permission seeding. Every route still needs an explicit valid policy and all business safeguards.
7. Administrator and Super Admin are protected system roles. Editor and Viewer presets are seeded once as ordinary roles; seed reruns preserve their saved grants and names. Ordinary roles never receive new permissions automatically.
8. Keep at least one active full-access Administrator or Super Admin. Prevent self-deactivation, self-deletion, and changes to one's own role assignments. Another full-access administrator can change a different account subject to the last-active-admin rule.
9. Permissions are loaded from the database per request, with request-local memoization only. JWTs contain identity/session claims, not authoritative role or permission claims. Committed grant/revoke changes affect the next request using an existing token. Requests already authorized may finish; do not claim cancellation of in-flight work.
10. Deactivation/deletion revokes sessions and invalidates outstanding password-reset tokens. Password changes retain existing session revocation behavior. Role changes need no new token because authorization is resolved afresh.
11. Staff creation uses the existing strong password validation/hash flow and sets `must_change_password = true`. Enforce that flag server-side: until changed, allow only account/password, logout, and identity endpoints. Never flash, audit, or return a password. Invitation/acceptance workflows and MFA are separate scope.

## 4. Data model

Add new forward migrations with unused timestamps after the latest current migration. Do not edit historical migrations. Use InnoDB-compatible foreign keys with the same integer types as referenced IDs.

| Table | Required fields and constraints |
| --- | --- |
| `roles` | unsigned integer PK; unique immutable `slug` (80); `name` (120); nullable `description` (500); `is_system` boolean default false; timestamps |
| `permissions` | unsigned integer PK; unique `key` (120); `module` (80); `action` (80); `label` (160); nullable description; `is_active` default true; timestamps; index `(module, is_active)` |
| `role_permissions` | `role_id`, `permission_id`; composite primary/unique key; FK cascades for join rows; index starting with `permission_id` |
| `user_roles` | `user_id`, `role_id`; composite primary/unique key; timestamps as needed; index starting with `role_id`; user FK cascades; role FK restricts deletion while assigned |
| `rbac_state` | fixed singleton PK `id = 1`; `initialized_at` nullable; `defaults_initialized_at` nullable; timestamps; inserted once by migration |

`rbac_state` is both the one-time-bootstrap marker and a stable lock row. Every access-administration mutation (staff creation/update/status/delete, membership changes, role/grant changes, bootstrap, and seeding) must acquire this row with `FOR UPDATE` first, in its transaction. Then lock affected rows in a consistent order. This serializes low-volume administration and prevents concurrent operations from removing the last owner. A plain count check outside this lock is insufficient.

Reuse `audit_logs.changed_fields` for safe before/after status, role IDs, and permission keys. No audit migration is needed unless a concrete type limitation is found. Do not store credentials/tokens or full form bodies. Preserve audit history when users disappear.

Role slugs are immutable after creation. `super_admin` and `administrator` are protected system roles with full access; neither can be edited or deleted. Editor, Viewer, and custom roles are ordinary roles. No role active/inactive lifecycle in v1; removing a role's grants or memberships handles access changes. Delete an assigned role only after explicit reassignment; return a useful conflict instead of cascading away user access.

Acceptance: migrations work on both an existing schema and a clean test database; uniqueness/FKs prevent duplicate and orphan assignments; rollback drops new tables in dependency order without touching users/content.

## 5. Permission catalogue and seeding contract

Create `app/authorization/permission_catalog.ts`. Export a typed immutable list and `PermissionKey` union; every entry has key, module, action, label, description, and whether it is reserved to Super Admin. This is the authoritative catalogue consumed by the seeder, route policies, validation, and tests. Use explicit strings; no wildcard grants and no page/filesystem scanning.

Initial permissions:

| Module | Actions / exact key prefix |
| --- | --- |
| Dashboard | `dashboard.view` |
| Places, including Explore fields and place media | `places.view`, `places.create`, `places.update`, `places.delete`, `places.publish`, `places.archive` |
| Categories | `categories.view`, `categories.create`, `categories.update`, `categories.delete` |
| Category types | `category_types.view`, `category_types.create`, `category_types.update`, `category_types.delete` |
| Static pages | `pages.view`, `pages.create`, `pages.update`, `pages.delete`, `pages.publish`, `pages.archive` |
| Place feature definitions | `place_features.view`, `place_features.create`, `place_features.update`, `place_features.delete` |
| Movies | `movies.view`, `movies.create`, `movies.update`, `movies.delete`, `movies.publish`, `movies.archive` |
| Showtimes | `showtimes.view`, `showtimes.create`, `showtimes.update`, `showtimes.delete`, `showtimes.publish`, `showtimes.cancel` |
| Contact requests | `contact_requests.view`, `contact_requests.update` |
| Homepage and homepage cards | `home.view`, `home.update` |
| Transport locations | `transport.view`, `transport.create`, `transport.update`, `transport.delete` |
| Site settings and logo | `settings.view`, `settings.update` |
| Registered app users | `customers.view` |
| Staff | `staff.view`, `staff.manage` (reserved) |
| Roles | `roles.view`, `roles.manage` (reserved), `roles.assign` (reserved) |
| Activity feed | `audit_logs.view` |

No standalone image permission: private image access follows the owning module's `.view` permission. No permission management CRUD UI: administrators choose existing permissions; developers declare permissions in code.

Create `app/services/permission_sync_service.ts` and thin `database/seeders/permission_seeder.ts`:

- Validate catalogue uniqueness and key format before any write. Use a transaction and the singleton lock.
- Upsert by stable key: insert missing permissions; update labels/module/action/description; activate catalogue entries. Preserve IDs and role joins.
- Mark DB permission keys absent from the catalogue inactive; never delete them or their joins. The runtime also requires catalogue membership, so stale DB rows cannot authorize a removed operation.
- Do not restore retired grants on reusing an old key: permission keys must never be reused for different semantics. Renames require an explicit reviewed grant migration; do not guess equivalence.
- Seed `super_admin` if absent. It uses controlled effective-permission expansion; do not maintain a misleading editable list of Super Admin grants.
- Seed Administrator as a protected full-access system role whose effective permissions expand to all active catalogue entries, including reserved staff/role permissions. Its full access also covers newly added permissions after catalogue synchronization. Seed Editor and Viewer once with explicit content grants. Editor excludes staff/roles/audit logs/settings, contact requests, and publish/archive/cancel/delete operations; Viewer includes dashboard and content views but excludes staff/roles/audit logs/settings/contact requests. Explicitly enumerate their grants rather than using prefix rules. Include `.view` whenever a role has another action in that module.
- Existing ordinary roles and their grants/names are never overwritten, even if they match a preset slug. Detect preexisting reserved-slug collisions rather than taking over an arbitrary custom role.
- Report counts inserted/updated/retired without credentials. Repeated runs produce no duplicate records or unexpected membership/grant changes. Audit effective catalogue changes with a system actor (`actor_id = null`), not a fictitious staff account.
- This seeder never promotes users, changes passwords, resets role grants, or deletes custom roles.

The initial Editor list is: `dashboard.view`; `places.view/create/update`; `categories.view/create/update`; `category_types.view/create/update`; `pages.view/create/update`; `place_features.view/create/update`; `movies.view/create/update`; `showtimes.view/create/update`; `home.view/update`; `transport.view/create/update`. Slash notation here abbreviates separate full keys (for example, `places.view`, `places.create`, `places.update`); use full literals in code. Viewer receives `dashboard.view` and `.view` for places, categories, category_types, pages, place_features, movies, showtimes, home, and transport. These are product presets, not continually synchronized policies.

The installed Ace CLI supports `--files`; run `node ace db:seed --files database/seeders/permission_seeder.ts` after migrations.

Acceptance: seed twice; modify a custom role and seed again; add a temporary test catalogue entry; retire an entry. Assert stable IDs, preserved custom grants, new permission denied to ordinary roles, new permission available to Super Admin only after active synchronization, and retired permission denied to everyone. Use injected catalogue data in tests rather than editing the production catalogue during tests.

## 6. One-time bootstrap and compatibility

Create `commands/rbac_bootstrap.ts` (`rbac:bootstrap`) and a shared bootstrap service. Accept an explicit `--email` for the initial owner. This is a local operator action, never an HTTP endpoint.

1. Require the chosen account to exist, be a CMS admin, and be active. Fail clearly otherwise; do not invent credentials or select the first user.
2. Require the permission catalogue/default roles to have been seeded.
3. Acquire the singleton lock. Reject a second bootstrap when `initialized_at` is already populated.
4. Assign the selected account `super_admin`. Assign all other preexisting legacy `role = 'admin'` accounts to the protected full-access Administrator role, including inactive accounts whose active flag still blocks login. Both memberships retain full access, including access administration.
5. Write auditable membership changes and set `initialized_at` in the same transaction. No password/status changes. A failure rolls everything back.
6. Do not infer Super Admin from `users.role = 'admin'` at runtime, on login, or on later seeder runs.

Update `database/seeders/admin_seeder.ts` so first-install account creation still works before bootstrap and existing credential-reset protections remain intact. After initialization, refuse creation of a new privileged account through this seeder and direct operators to Staff Management. Ordinary reruns must not restore removed roles or promote an existing account. Inspect `demo_seeder.ts` for privileged user creation and keep demo provisioning test/development-only.

For tests, create shared helpers in `tests/helpers/rbac.ts`: seed catalogue once per isolated fixture lifecycle; explicitly create Super Admin / role-restricted staff / no-role staff. Existing tests insert raw admin users after truncation and will otherwise fail after enforcement. Update fixtures explicitly; never add a production fallback that grants access to unassigned users.

Acceptance: chosen owner retains administration, other migrated staff retain content access, bootstrap is atomic and cannot rerun, and a newly inserted legacy admin with no RBAC membership cannot access modules.

## 7. Central authorization service

Create `app/services/authorization_service.ts` and shared types in `app/authorization/types.ts`.

Suggested contract (adapt signatures to local conventions):

```ts
type AuthorizationContext = {
  roleIds: number[]
  roleSlugs: string[]
  isSuperAdmin: boolean
  isFullAccessAdmin: boolean
  permissions: ReadonlySet<PermissionKey>
}

loadAuthorization(userId, transaction?)
can(authz, permission: PermissionKey): boolean
requireAll(authz, permissions: readonly PermissionKey[]): void
requireSuperAdmin(authz): void // for operations explicitly reserved to the bootstrap owner
```

- Query role memberships and active permission grants in a bounded number of joins. Filter by active catalogue entries. A Super Admin's effective set expands only to catalogue keys that also exist as active DB records.
- Reject unknown keys before the Super Admin branch; do not allow `can('*')` or truthy fallback behavior.
- Extend `HttpContext` with `authorization`; keep `admin` identity and authentication responsibilities separate. Load after authentication and memoize for that request only.
- Extend `AdminIdentity` and its authenticated DB select with the real `must_change_password` value. The middleware restriction and shared frontend flag must use this persisted value; never trust a submitted flag. Let existing password-change/reset services clear it only after a successful password replacement.
- For access-administration services, recheck the actor's active account, live session, and current protected Administrator or Super Admin membership inside the locked transaction. Do not trust the pre-transaction request snapshot for these mutations.
- Reserve access-management keys in validation AND enforcement. An accidental reserved permission row assigned to an ordinary role still cannot authorize access administration. Only protected Administrator or Super Admin membership can do so.
- Return explicit `ApiError(403, 'FORBIDDEN', ...)` for authorization denials, 401 for failed authentication. Business conflicts such as the final owner/assigned-role protection use 409. Invalid submitted IDs/permission choices use 422. Preserve existing 404 behavior for missing resources.
- Database unavailability propagates as an error, never an empty check interpreted as allow.

Acceptance: unit tests for unions, duplicate memberships, no roles, reserved keys, unknown/retired keys, and Super Admin behavior; integration test revocation and role changes with the same access token on the next request.

## 8. Enforce policies across all admin routes

Create `app/authorization/admin_route_policies.ts`, `app/middleware/admin_authorization_middleware.ts`; register named middleware in `start/kernel.ts` and apply after `jwtAdmin` to all three protected admin groups in `start/routes.ts`.

Use a registry keyed by unique route names. Give unnamed protected routes stable names; retain existing names to avoid breaking generated links. Registry entries are one of:

- `permissions`: explicit nonempty list with ALL semantics.
- `authenticated`: narrowly enumerated account/password/logout/identity endpoints.
- `resource`: a named, audited policy resolver for private images or save-success destinations.

Missing route name or missing policy is denied, including for Super Admin. Public login/refresh/reset endpoints stay outside these protected groups with their current throttles and validations. Authentication alone must never imply module access.

Add an automated route inventory test that enumerates actual registered routes under `/admin`, `/api/v1/admin`, `/api/v2/admin`, excludes only the exact public auth endpoints, and asserts one policy per method/name plus no stale policy references. Reject unrecognized policy kinds and unknown permission keys. Do not rely only on a text search or on opt-in route metadata: a forgotten future route must be denied at runtime. Inspect the installed Adonis router APIs before implementing enumeration.

### Required mapping

| Route/operation family | Required permissions |
| --- | --- |
| Dashboard GET, v1 dashboard | `dashboard.view`; filter contained modules separately (section 10) |
| Module lists/details/previews | Corresponding `.view` |
| New/create form GET and create mutation | `.view` + `.create` |
| Edit form GET and update mutation | `.view` + `.update` |
| Delete mutation | `.view` + `.delete` |
| Publish/archive/cancel mutation | `.view` + exact transition permission |
| Place Explore view/save | `places.view` / `places.view` + `places.update` |
| Place cover/gallery upload/update/delete | `places.view` + `places.update` |
| Category type image upload/remove | `category_types.view` + `category_types.update` |
| Movie poster upload/remove | `movies.view` + `movies.update` |
| Homepage hero and card create/update/delete | `home.view` + `home.update` |
| Place featured flag | `places.view` + `places.update` + `home.view` + `home.update`; enforce on every alternative payload path too |
| Site settings and logo changes | `settings.view` + `settings.update` |
| Contact status update | `contact_requests.view` + `contact_requests.update` |
| Staff list | `staff.view` |
| Staff create/edit forms and profile/status/delete/reset mutations | `staff.view` + `staff.manage` AND current protected Administrator or Super Admin membership |
| Role assignment included in staff mutation | Above plus `roles.assign`, current protected membership |
| Roles list/detail, permission catalogue choices | `roles.view` |
| Role create/edit forms and role/grant/delete mutations | `roles.view` + `roles.manage`, current protected membership |
| Own account/password/logout and API identity | Authenticated; own account only |
| Private images | Owning module `.view`, resolved from the actual stored key |
| `/:resource/saved` | Exact whitelisted resource `.view`; no dynamic string-to-permission guessing |
| v2 admin `/pages/:slug`, `/site` | `pages.view`, `settings.view` respectively, even though they reuse public-data controllers |

All modules in the catalogue must be mapped on every existing browser/v1/v2 endpoint, including nested child/media endpoints. V1 and v2 currently do not have staff/role CRUD APIs; add management browser routes only in this scope. Any future management API must call the same services.

### Checks inside save handlers

Route checks alone do not cover payload-dependent operations. Inspect all controllers/validators/write services before mutation:

- `app/controllers/admin/places_controller.ts` currently accepts `intent = 'publish'` on its save action. Require `.publish` in addition to `.create`/`.update` before saving anything, storing uploads, or emitting side effects.
- Movie/showtime validators accept status in ordinary create/update payloads. Require the transition permission for entering published/archived/cancelled states. Saving an existing published record without a state transition requires `.update`; transitioning out of a live state requires the appropriate archive/cancel permission. Reject unsupported transitions instead of silently coercing them.
- Do not let a generic update revert a published/archived record to draft without transition authorization: use `.archive` for places/pages/movies and `.cancel` for showtimes when leaving a live state through a generic payload. Returning an already non-live record to draft needs `.update`. Creating directly in a non-draft state also needs that state's transition permission.
- Place `featured` / `featured_order` appear in ordinary content writes as well as a dedicated endpoint; apply the same combined places/home check when their effective values change. On create, default false/null needs no homepage grant; setting a feature does.
- Attaching existing category/type/feature/movie/place IDs must validate real IDs, expected types, and relationships. Treat these as limited form lookups, not permission to edit those modules.
- Any operation that can edit another module must require that module's write permission too. Reject unauthorized compound writes atomically.
- Place these checks before broad controller catch blocks, or rethrow authorization exceptions explicitly. A controller must not swallow a 403 into a success/validation redirect after a partial write.

Define shared status/compound-write policy helpers so browser and API paths use identical checks. Pass trusted authorization context from the authenticated controller; never derive it from request body fields. Existing low-level write services may remain authorization-agnostic only if all HTTP call sites go through the same policy helper before invoking them; enumerate and test those call sites.

Acceptance: direct requests to all three surfaces are denied appropriately; view-only accounts cannot mutate; crafted save/status/featured payloads cannot bypass dedicated action permissions; denied requests create no DB changes, uploads, emails, or success audits.

## 9. Staff and role application services

### Staff

Create `app/services/staff_management_service.ts`. Refactor `app/controllers/admin/users_controller.ts` into a thin HTTP adapter while retaining `/admin/users` URLs, page resolver names, pagination/filter behavior, and existing password-reset integration. Change visible wording from Users/Administrator to Staff where appropriate.

- List staff with roles, status, password-change state; add role filter and validate pagination/search/IDs. Never expose hashes, tokens, or sessions.
- Create: whitelist name/email/password/role IDs; normalize email; hash password; enforce unique DB constraint; require at least one valid role. In one transaction, authorize actor, create CMS user, attach roles, write audit. Clear password from flashed form data on errors; current controller flashes `request.all()` and must be corrected.
- Update: whitelist name/email/status/role IDs and replace memberships atomically. Never accept `isSuperAdmin`, permission arrays, `is_system`, legacy account type, or arbitrary columns. All supplied roles must exist. Roll back everything on validation/invariant failure.
- Self: allow ordinary own profile/password only through Account. Staff Management must reject self-delete/deactivate and self-role changes; other allowed self profile edits must preserve these invariants.
- Before deleting/deactivating/demoting another full-access Administrator, count remaining active Administrator or Super Admin memberships after applying the proposed change under the singleton lock. Reject if zero.
- On deactivation/deletion revoke sessions and consume outstanding reset tokens in that transaction. Preserve audit history and existing FK behavior. Do not automatically reactivate sessions when an account is reactivated.
- Password reset: require reserved management access; target must be an active CMS staff account. Audit request without tokens and preserve existing generic public recovery responses. Validate and commit the request before sending email; never send email for a rejected transaction. Handle delivery errors without rolling back a committed access change or leaking secrets.
- Handle unique-email races using DB errors as well as validation, with a safe user-facing message.

### Roles

Create `app/services/role_management_service.ts`, `app/controllers/admin/roles_controller.ts`, and `app/validators/admin_roles.ts`.

- List roles with staff count and grouped permissions; detail read access is governed by `roles.view`.
- Create role from a name/description, safe unique slug, and explicit permission keys. Empty roles are allowed and grant nothing. Slug is generated server-side and immutable.
- Update name/description and replace the full permission set in a transaction. Validate all keys exist in the current active catalogue; reject unknown/retired/reserved keys. Require the module's `.view` alongside any other action; validate rather than silently granting extra access.
- Super Admin cannot be renamed, deleted, have its slug/system flag changed, or have an editable grant set. Membership changes occur only through guarded staff assignment.
- Deleting an assigned role returns 409; unassigned custom roles can be deleted. Presets are ordinary editable/deletable roles after seeding; deleting one must not trigger surprise recreation/grants on the next seed. Use `rbac_state.defaults_initialized_at` so initial preset creation runs only once, marking it in the same transaction as initial default roles/grants.
- All mutations reauthorize within the locked transaction and record safe before/after metadata in the same transaction.

Browser route contract:

```text
GET  /admin/roles                  list (roles.view)
GET  /admin/roles/:id               read-only detail (roles.view)
GET  /admin/roles/new               create form (roles.manage)
POST /admin/roles                  create (roles.manage)
GET  /admin/roles/:id/edit          edit form (roles.manage)
POST /admin/roles/:id/save          update (roles.manage)
POST /admin/roles/:id/delete        delete (roles.manage)
```

Apply the complete section 8 permission requirements, not just the abbreviated comments above. Register static `/new` before `/:id`. Use the existing staff routes, including `/send-reset`; do not create a parallel staff account table or duplicate controller family.

Acceptance: valid role/staff workflows succeed, custom grants work immediately, invalid IDs/keys cannot partially update, reserved role manipulation fails, and concurrent owner mutations cannot remove the final active owner.

## 10. Prevent indirect read access and dead-end navigation

### Dashboard

`app/controllers/admin/dashboard_controller.ts` currently queries place counts, contact counts, category-type breakdowns, and audit events for every admin. `app/controllers/api/admin_site_controller.ts` has a separate dashboard path. Gate the route with `dashboard.view`, then query/serialize each widget only if the user also has its module's `.view`. Require `audit_logs.view` for the audit feed and resolve related record labels/links only when that entity's view permission is granted. Filter audit events by module visibility; staff/role events additionally require their respective view permissions. Do not send hidden counts, names, URLs, or events in Inertia props/API JSON. Hide unavailable widgets in React.

### Private images

Extend `app/services/image_reference_service.ts` with a key-to-owner resolver. Current image owners are places cover/gallery, category types, homepage, site settings, and movies. For `/admin/images/:key` and `/api/v1/admin/images/:key`, require `.view` for at least one actual referencing owner module; never allow private access merely because any admin knows a key. Keep `private, no-store`. Public image delivery keeps the existing publication checks and remains available for already-public images.

### Form lookups and bundled data

Inspect create/edit payloads for cross-module lookups. A staff member who can edit places needs minimal allowed category/type/feature options; this does not grant full category management access. Return only IDs/labels/type fields needed by that form. The same applies to theater/movie options in showtime editors. Do not weaken standalone protected list endpoints to satisfy dropdowns. Require `.view` for the edited module and supply bounded lookup data from that authorized controller.

### Landing and utility pages

Keep `/admin` as the dashboard policy. Add a server-side `admin_landing_service.ts` that picks the first permitted destination in a fixed list after browser login/refresh (dashboard, content modules, read-only staff/roles lists, then Account). Do not redirect a user without `dashboard.view` to `/admin` or create a redirect loop. Use the same allowed destination for the brand link and forbidden-page navigation. A no-role account can still change its password and log out. Password-change-required users always land on Account.

## 11. React/Inertia changes

Create shared frontend types/helper, e.g. `inertia/lib/authorization.ts`, and update existing Inertia declaration files under `app/types/` after inspecting them.

Expose a small `auth` object: user ID/name, role summaries, effective permission key array, `isSuperAdmin`, `mustChangePassword`, and safe landing URL. No password/session/token fields. Public login/reset pages receive `auth: null`.

Important lifecycle detail: existing `InertiaMiddleware` initializes before route authentication. Use a lazy shared-prop callback or explicitly share after authentication; confirm installed Inertia APIs so reading `ctx.admin` does not happen before it exists. Make auth data always included even on partial reloads, and verify SSR. No cross-request module-global state.

- Update `inertia/layouts/admin_layout.tsx`: filter links by `.view`, remove empty groups, rename Users to Staff, add Roles & Permissions, keep Account/Logout available. All links use the effective permissions from the server.
- Add `can` / `canAll` UI helpers. Filter new/edit/delete/publish/archive/reset/feature controls on every existing page and row menu. Do not merely disable a hidden submit button while leaving an alternate form action available.
- Pages with `.view` but no `.update` must offer useful read-only behavior. For existing modules without a read-only detail route, the list remains available and the edit link is hidden. Build role detail for `roles.view`; no new read-only staff-detail route is required.
- Staff pages: role multi-select, role filter, role badges, explicit current-account labeling, deactivation/delete confirmations, no self-role controls. Render password fields only when needed; never refill them from flashed data.
- Roles pages: index, read-only detail, create/edit form with grouped permission checkboxes; module select-all clears/selects only ordinary assignable keys. Display dependencies and validate on server. Protected system roles show a locked explanation. Empty and assigned-role-delete errors are understandable.
- Add `inertia/pages/errors/forbidden.tsx` and explicit CMS 403 rendering in `app/exceptions/handler.ts`. Return HTTP 403 for standard and Inertia requests. For Inertia, render a valid Inertia error page, not raw JSON/HTML that causes an invalid-response dialog. Catch only expected authorization errors and preserve existing exception behavior.
- Register new page names in `config/inertia.ts` SSR pages; confirm `inertia/page_resolver.ts` and current generated page typing conventions. Reuse Ant Design forms/tables and current styling; no design-system migration.
- A permission revoked while a page is open must be denied server-side on the next action and result in a usable forbidden page. UI visibility improves usability; backend checks remain authoritative.

Acceptance: SSR renders restricted users correctly, navigation/actions match permissions, shared props contain no forbidden module data, partial reloads do not retain stale authorization, and a denied mutation is a real 403.

## 12. Audit behavior

Use consistent events, for example: `staff.created`, `staff.updated`, `staff.activated`, `staff.deactivated`, `staff.deleted`, `staff.roles_changed`, `role.created`, `role.updated`, `role.permissions_changed`, `role.deleted`, `rbac.bootstrapped`, and `permissions.synced`. Reuse the existing reset audit convention where practical rather than duplicating one event under two names.

For access changes include old/new role IDs or permission keys, target ID, actor ID, and safe changed-field names. Mutation plus audit must commit atomically. Never log password fields, token values, cookie/header values, or the complete request. Log denied access through the application logger with actor, route/action, and request ID; avoid adding a database-write dependency to every authorization check.

Update dashboard action labels for new events and apply the feed restrictions from section 10. A standalone audit-browser module is outside scope.

## 13. Test plan and required gates

Write behavioral tests, including security failures, using the existing Japa conventions and isolated MySQL test database. Do not run truncation tests against development/production data. Preserve the safeguard in `tests/bootstrap.ts`.

Suggested new files:

- `tests/unit/authorization.spec.ts`: pure catalogue/check/transition rules.
- `tests/functional/permission_seeder.spec.ts`: repeatability, retire/reactivate semantics, no privilege restoration, default-role initialization, rollback.
- `tests/functional/rbac_bootstrap.spec.ts`: initial assignments, invalid owner, one-time lock/marker behavior.
- `tests/functional/rbac_routes.spec.ts`: policy inventory and denied/allowed browser/v1/v2 access, unknown future route default deny.
- `tests/functional/staff_management.spec.ts`: guarded mutations, validation, secrets, audit, revocation, role filtering.
- `tests/functional/role_management.spec.ts`: grants, protected role, assigned-role deletion, immediate revocation.
- `tests/functional/rbac_data_visibility.spec.ts`: dashboard/lookup/private-image/shared-prop isolation.
- `tests/browser/cms_rbac.spec.ts`: restricted navigation, staff create/assign/deactivate, role matrix, real forbidden page, no stale action after permission change.

Required scenarios:

1. Anonymous CMS/API requests preserve login/401 behavior; authenticated unauthorized requests produce 403.
2. Super Admin, content Editor, Viewer, single-module role, union of two roles, and no-role staff behave as specified. Frontend props cannot elevate any account.
3. Real table-driven requests verify each protected route policy with a user lacking the required permission. Ensure the guard runs before body validation/DB writes, so denial is 403 even without a valid business payload. Use valid representative fixtures for positive tests across modules and all three route surfaces.
4. Explicitly test publish-on-save, status payloads, featured payloads, nested uploads, movie/showtime transitions, and parameter tampering. Denied compound writes are atomic.
5. Revoking a grant, changing memberships, or deleting an unassigned role affects a subsequent request without a new JWT. Deactivation rejects both old access and refresh tokens. Reactivation does not resurrect sessions.
6. Self-role change/deactivation/deletion is rejected; last-owner demotion/deletion/deactivation is rejected. Test two simultaneous operations with separate real DB connections: they cannot both succeed in removing all active owners. Do not hide this race inside a single test transaction/connection.
7. Existing read-only staff cannot create roles, assign themselves Super Admin, forge system flags, submit reserved keys, or trigger privileged reset emails.
8. Dashboard/API/SSR/partial reload props and private image URLs cannot expose restricted records. Public content and customer authentication remain unchanged.
9. Staff creation errors never flash password fields; reset tokens/hashes are absent from UI, logs, and audits. Initial password change is enforced by middleware and APIs.
10. Seeder reruns preserve intentional grant removals and deleted preset roles; first-install bootstrap works; failure leaves no partial memberships.

Update existing functional/browser fixture builders to explicitly assign needed roles after truncation. Keep existing authentication, CSRF, password reset, content lifecycle, image visibility, customer account, and CMS browser tests passing. Do not weaken assertions just to accommodate new checks.

Run commands after confirming current CLI flags:

```text
npm run typecheck
npm run lint
node ace test unit
node ace test functional
node ace test browser
npm run build
```

Run focused suites while implementing; run the full gates once the feature is integrated. If the repository already fails a check, record the exact preexisting failure and distinguish it from new failures. If MySQL/browser setup is unavailable, report the blocked gate explicitly; do not claim it passed. Inspect `node ace --help` / command help before choosing schema-generation, seed, or route-list flags. Regenerate `database/schema.ts` using the installed schema generator if required; do not hand-edit generated schema output.

## 14. Ordered execution batches

| Batch | Work | Completion gate |
| --- | --- | --- |
| 0 | Check working tree/instructions; inspect named files; record baseline checks and actual route inventory | No uncertainty about existing auth/account distinction or route surfaces |
| 1 | Migrations, catalogue, default role definitions, sync service/seeder, test helpers | Schema + seeder tests pass; no automatic ordinary-role expansion |
| 2 | Bootstrap service/command and admin/demo seeder integration | Clean install and existing-admin backfill tests pass |
| 3 | Authorization service, typed context, route registry/guard, password-change restriction, forbidden response | Actual route inventory complete; unknown route denied; core auth tests pass |
| 4 | Map all CMS/v1/v2 routes; add status/compound-write policies; private image/data filtering/landing behavior | Cross-surface bypass and data visibility tests pass |
| 5 | Staff service/refactor and role service/controller/validator/routes with transactional invariants/audits | Role/staff/revocation/concurrency tests pass |
| 6 | Shared props, navigation/action gating, role pages, staff role UI, SSR config | Browser workflows and 403 handling pass |
| 7 | Update all legacy fixtures, run full gates, write operational docs | Definition of done satisfied; concise final change/verification report |

Batches are development checkpoints, not independently deployable releases. Do not expose a release between adding schema and completing enforcement/bootstrap.

## 15. Deployment and future-module runbook

Write `docs/staff-rbac-operations.md` with exact verified commands and expected results.

Initial rollout (operator actions; prepare and document, do not execute against production):

1. Back up the DB and identify the intended active owner email. Review the migration/backfill assignment report.
2. Enter maintenance mode or otherwise stop incoming admin requests and drain old app instances. Avoid mixed old unrestricted code and new policy enforcement.
3. Apply forward migrations, run the permission seeder, then run `rbac:bootstrap --email <owner>` using the deployed code. Fresh installs create the initial admin through the existing environment-driven AdminSeeder first.
4. Verify `rbac_state.initialized_at`, the selected active owner membership, and the expected legacy Administrator assignments. No password resets during rollout.
5. Start the fully updated app; smoke-test owner login, restricted account denial, role grant/revoke, v1/v2 protection, and ordinary public/customer requests. Then restore traffic.
6. Create a second trusted Super Admin through Staff Management for account recovery. Do not add a default shared password, public recovery bypass, or repeated automatic owner seeding.

Future module workflow:

1. Declare stable permission keys/labels in the catalogue.
2. Add explicit route policies and payload-specific checks; update actual route coverage tests.
3. Run the permission seeder during the coordinated release. Super Admin receives the new active keys; custom roles require an explicit grant through Roles & Permissions.
4. Add frontend visibility rules and positive/negative tests. A seeder creates permission definitions; wiring routes and controls is still required.
5. To retire an operation, remove its routes/policies/catalogue key in a coordinated change and seed to retire the DB row. Never repurpose a key for different semantics.

Rollback: a plain rollback to old unrestricted application code after RBAC launch reopens access. Keep maintenance active if reverting a failed first rollout; prefer a forward fix or restore the coordinated application/database backup. Do not drop RBAC tables while new code is serving traffic. Document offline account recovery separately if needed; do not implement an HTTP bypass.

## 16. Definition of done

- Staff and role workflows function in the current React/Inertia CMS; existing content/customer behavior remains compatible.
- Every admin route has an explicit checked policy and is denied when unclassified.
- All effective permission changes apply on the next request; disabled accounts lose access/refresh/reset capability as specified.
- Protected role and last-owner rules survive concurrent operations.
- Seeder updates catalogue metadata without overwriting ordinary role choices, restoring deleted presets, or promoting users.
- Existing admins are migrated only through the explicit, auditable bootstrap.
- No sensitive or forbidden data leaks through props, dashboards, media, lookup endpoints, or failed forms.
- Required gates pass, or genuine environment/preexisting blockers are documented accurately.
- Operational docs include initial rollout, future permission updates, recovery considerations, and rollback limitations.

Security rationale: least privilege, deny by default, per-request checks, protected resources, and integration tests follow the [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). The specific role model and operational decisions above are this project's design, not a claim that OWASP prescribes this schema.

## 17. Paste-ready executor prompt

```text
Implement Staff Management + Roles & Permissions in this repository by following
docs/staff-rbac-implementation-plan.md, in its batch order. Treat its decisions,
permission matrix, seeding rules, concurrency safeguards, and acceptance criteria
as the specification. Inspect current files and applicable AGENTS.md first.
Preserve all existing uncommitted CMS migration work. Use the current stack and
shared services; do not add an auth provider or replace the frontend. Implement
the complete feature, tests, and operational documentation. Do not deploy, push,
commit, or run destructive commands against non-test databases. Update the
progress checklist in the plan after each completed batch. Keep chat updates
brief. If blocked, state the exact failing command/environment requirement and
continue independent work. Finish with changed areas, checks run/results, and
any remaining blockers.
```

## 18. Executor progress

- [x] Batch 0: baseline and inventory; pre-existing CMS migration work preserved.
- [x] Batch 1: schema/catalogue/seeding; permission sync is idempotent and retires removed catalogue entries.
- [x] Batch 2: bootstrap/compatibility; `rbac:bootstrap --email <existing-active-admin>` assigns the initial owner and migrates legacy admins.
- [x] Batch 3: central authorization/guard; request-time DB permissions, default-deny policies, must-change-password restriction, and live Super Admin rechecks are in place.
- [x] Batch 4: all routes and indirect access; protected route inventory matched the policy registry, and dashboard/audit/image access is permission-filtered.
- [x] Batch 5: staff/role services and workflows; transactional role assignment, last-Super-Admin checks, reset invalidation, and role CRUD are in place.
- [x] Batch 6: CMS UI and SSR; staff/roles pages, shared auth props, permission-filtered navigation, dashboard widgets, and forbidden page are registered.
- [ ] Batch 7: typecheck passed and `node ace list:routes` inventory matched policies. Functional/browser suites and database migration/seeder execution were not run in this pass.
