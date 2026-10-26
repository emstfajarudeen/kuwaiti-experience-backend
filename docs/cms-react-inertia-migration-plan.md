# CMS migration plan: React + Inertia.js

Status: local implementation complete, 23 October 2026. All reachable admin GET screens use React + Inertia. Local functional and browser verification is recorded in [the parity ledger](cms-parity-ledger.md). Staging acceptance and production cutover remain release activities.

## 1. Goal and acceptance contract

Replace the browser CMS at `/admin` with React and Inertia.js inside the existing AdonisJS application. Preserve every currently reachable CMS screen, URL, authorization rule, input rule, business operation, success and failure path, and visible interaction. Keep the MySQL schema, content services, image ownership model, and `/api/v1` and `/api/v2` contracts intact.

Inertia changes the transport used for navigation and the initial HTML shell. The parity requirement therefore applies to observable CMS behavior and backend effects, not byte-for-byte HTML or request headers. Any observed difference needs an entry in the parity ledger and explicit resolution before release. Do not combine this migration with a redesign or a business-rule refactor.

**Release gate:** Every row in the parity matrix below must have a baseline capture, an automated or recorded manual check against the React version, and a passing result. All existing functional tests, new browser tests, typecheck, lint, production build, and rollback drill must pass. A failing gate blocks the cutover.

## 2. Current implementation and scope

The repository currently has 24 admin Edge templates across `resources/views/admin/`, 10 admin controllers, approximately 38 `@form` uses in admin templates, 26 `view.render()` calls, 2,134 lines of CMS CSS, and custom DOM scripts for confirmations, FilePond, Quill, menus, and dirty-form protection. Some templates may be legacy; verify reachability before removing any. The test runner has browser support configured, but there is no `tests/browser` suite today. Existing CMS functional tests assert HTML details, so several need replacement with behavior and Inertia-response assertions.

Relevant sources: `start/routes.ts`, `app/controllers/admin/`, `resources/views/admin/`, `resources/views/components/layouts/admin.edge`, `resources/js/`, `resources/css/admin.css`, `app/middleware/jwt_admin_middleware.ts`, `config/shield.ts`, `config/bodyparser.ts`, and `tests/functional/cms_pages.spec.ts`.

| CMS area                    | Routes and behavior to preserve                                                                                                                 | Primary risk                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Authentication and account  | Login, invalid credentials, session continuation, access/refresh cookie rotation, logout, password change and forced sign-in                    | Inertia fetch redirects, expired tokens, history after logout, CSRF |
| Dashboard                   | Counts, recent activity, links and current data presentation                                                                                    | Prop mapping and date formatting                                    |
| Places                      | Search, type/status filters, sort, pagination, create/edit, English/Arabic fields, SEO, featured order, preview, save, publish, archive, delete | Large form, retained input, gallery/cover changes, private previews |
| Place Explore editor        | Type-specific fields, feature assignment, seven-day hours with split and overnight intervals                                                    | Dynamic nested payload and unknown/closed/open states               |
| Categories and types        | Lists, filters, create/edit/delete, ordering, active state, dependency rules, category-type image                                               | Checkbox semantics, dependent deletion, uploads                     |
| Pages                       | Create/edit, bilingual content, Quill HTML/plain-text modes, preview/publish/archive/delete                                                     | Editor lifecycle and exact sanitized output                         |
| Explore modules             | Place features, movies/posters, showtimes, list filters and delete rules                                                                        | Conditional forms, time values, images and relation constraints     |
| Homepage                    | Hero image, locale content, Explore cards, save and remove                                                                                      | Multiple forms on one page, image replacement                       |
| Site settings and transport | Branding/logo, contact and store settings, location create/edit/delete and pickup/drop-off flags                                                | Multiple forms, upload and checkbox values                          |
| Contact requests            | Inbox, pagination/filter, detail, status update                                                                                                 | Customer data exposure and status transitions                       |
| Shared shell                | Navigation, active state, notices/toasts, confirmations, mobile menu, save-success timer, dirty-form warning, 404/500 paths                     | CSS/DOM coupling and navigation across old/new pages                |

The existing browser CMS uses cookie authentication and CSRF. Admin JSON APIs use bearer authentication and reject CMS cookies. The React CMS must continue to submit to the browser controllers and existing service functions; it must not quietly switch to the admin JSON API with a second authentication model.

## 3. Target structure and engineering rules

Use the official AdonisJS Inertia adapter for React in the current application. Keep Adonis routes and server-side data fetching. Add an Inertia root Edge shell; it is framework bootstrapping, not a CMS screen. Global non-CMS error templates can remain Edge if their current behavior is preserved.

Suggested structure:

```text
inertia/
  app.tsx                 # Inertia/React boot and providers
  types.ts                # Shared prop types
  layouts/AdminLayout.tsx
  components/             # Form fields, notice, confirm dialog, table, pagination,
                          # image field, Quill field, dirty-form guard
  features/
    auth/ dashboard/ places/ categories/ category-types/
    pages/ explore/ home/ settings/ transport/ contacts/
  pages/                  # Thin route-facing page components grouped by feature
app/
  controllers/admin/      # HTTP adapters: load typed props, call existing services
  middleware/inertia_middleware.ts
  presenters/admin/       # Explicit, serializable, allowlisted CMS page props
resources/views/inertia_layout.edge
tests/browser/admin/      # Browser parity flows
```

- Keep business rules, transactions, authorization, validators, image processing, and audit behavior on the server. Avoid duplicating rules in React. Client checks may improve feedback but never replace server validation.
- Keep existing `/admin` paths and redirects. Name routes as needed for typed Inertia links/forms without changing paths or methods.
- Use typed page props and explicit presenters. Serialize dates, decimals, nullable values, and nested arrays deliberately. Never serialize password hashes, access/refresh tokens, internal image keys unnecessarily, or entire model/database rows.
- Use React components with local state/hooks for interactive controls. Wrap Quill and FilePond with mount/unmount cleanup; do not keep document-wide DOM mutation scripts in React pages. Preserve existing editor formats, upload limits, alt text, and error handling.
- Preserve the current visual layout and CSS behavior first. Reuse tokens/classes where useful; split styles by component only after visual parity. Do not introduce a new design system in this migration.
- Keep the private `/admin/images/:key` route and the existing public image visibility rules. Do not move uploads to public static assets.
- Do not require database migrations or change public/mobile API response schemas for this frontend migration.
- Disable Inertia SSR for the initial admin migration unless baseline testing establishes a requirement for it. Authenticated CMS SEO is not a reason to add SSR complexity. Record any current no-JavaScript workflows and retain those that work today through SSR or a server fallback before cutover.

## 4. Delivery phases and exit criteria

### Phase 0 — Baseline and parity ledger (1–1.5 engineer-weeks)

1. Enumerate every reachable `/admin` GET/POST route, its controller, template, inputs, response/redirect, flash keys, and side effects. Identify unused templates by route trace, not filename alone.
2. Capture representative current screenshots at desktop and narrow widths and record navigation, focus, messages, empty/loading states, list query strings, and success timing.
3. Add browser characterization tests on the existing Edge CMS before changing it: login/refresh/logout, CRUD/publish/preview, invalid form retention, upload/replace/remove, editor content, hours, filters, confirmations, and contact status.
4. Snapshot API responses and database effects for representative writes. Record upload file ownership and cleanup outcomes. Use the isolated test database and upload directory.
5. Create `docs/cms-parity-ledger.md` with one row per route/action/edge case, old expected behavior, new test, and status.

Exit: route/action inventory complete; baseline browser suite runs against the current CMS; no unclassified screen or form remains.

### Phase 1 — Inertia foundation and high-risk proof (1–1.5 engineer-weeks)

1. Install mutually compatible, locked React, React DOM, Inertia, Adonis Inertia, and Vite React packages for this AdonisJS 7 project. Use the official integration guide rather than copying starter-kit files blindly.
2. Register provider and middleware in the correct order alongside body parser, session, Shield, and `jwtAdmin`. Add root shell, typed page discovery, Vite entry, shared admin identity, errors, and one-time flash notices.
3. Preserve `/api/*` CSRF exclusions and bearer-only rules. Configure the Inertia CSRF mechanism for `/admin`; test missing/invalid token rejection and multipart submissions.
4. Prove login, token expiry/refresh during navigation and form submit, logout, password change, and back-button behavior with browser tests. Encrypt or clear browser history for sensitive authenticated props as appropriate.
5. Prove one real multipart place upload and an invalid upload, including private preview and cleanup. Verify current `config/bodyparser.ts` route patterns still match.
6. Keep the Edge route as the default until the proof passes. Use a staging-only route switch or nested `/admin` preview path for incremental work; do not expose two conflicting production behaviors at the same URL.

Exit: authentication, CSRF, error/flash delivery, one save, one upload, and production build work end to end in the new shell.

### Phase 2 — Shared React shell and controls (1–1.5 engineer-weeks)

Build `AdminLayout`, navigation, notices, confirmation dialog, table/filter/pagination controls, typed form fields, image picker, rich-text editor, and dirty-form guard. Preserve keyboard/focus behavior, accessible labels, mobile sidebar, notice dismissal, and the existing save-success page and 1.8-second return behavior. Centralize form submission/processing state and map field errors consistently. Keep list filters and page number in the URL.

Exit: shared components pass interaction and visual checks before module-wide reuse.

### Phase 3 — Migrate modules in controlled waves (3–5 engineer-weeks)

For each wave: convert GET to explicit Inertia props; keep POST service calls and validation; migrate the page; run its parity rows, backend tests, browser tests, and visual comparison; then switch that module in staging. Preserve redirect destinations and messages.

1. **Wave A:** Dashboard, contacts, account, and save-success.
2. **Wave B:** Categories, category types, and static pages, including dependency failures and Quill English/Arabic output.
3. **Wave C:** Places and Explore place editor, including listing, preview, gallery/cover operations, feature assignment, and every hours state.
4. **Wave D:** Place features, movies/posters, showtimes, homepage/cards, transport, and site settings.

During mixed Edge/Inertia staging, crossings between the two page types use full document navigation. Inertia visits stay within converted routes; an `X-Inertia` request must never receive an old Edge document. Remove the old template and script for a route only after its replacement has passed the ledger. Retain the old implementation in the release branch or rollback build until cutover is accepted.

Exit: every reachable CMS route has a React page or an explicitly documented non-CMS/error response; no user-facing Edge CMS template is still required.

### Phase 4 — Regression, cutover, and rollback rehearsal (1.5–2.5 engineer-weeks)

1. Run all existing functional and unit tests. Replace assertions that depend on old Edge markup with assertions of actual user behavior, Inertia props, redirects, security, and persisted effects. Do not delete a test without equivalent coverage.
2. Run the new browser suite against a production build with realistic seed content, multiple locales, multiple records, and private images. Check desktop and mobile widths, keyboard access, browser back/forward, direct/deep links, refresh, timeout, invalid input, duplicate submit, network error, and upload failure.
3. Verify unchanged `/api/v1` and `/api/v2` contracts, database records, audit entries, image storage ownership/cleanup, and 404/500 responses.
4. Compare current and migrated screenshots for every screen and fix material differences. Confirm no console errors, unhandled rejections, or incorrect Inertia responses.
5. Deploy to staging, complete an editorial acceptance pass, and rehearse rollback to the previous CMS build without changing schema or data. Pin the old assets/build for the rollback window.
6. Cut over by route switch/release, observe login failures, 4xx/5xx, upload failures, console errors, and editor saves. Roll back immediately on a failed parity gate.

Exit: parity ledger 100% resolved, automated gates green, staging sign-off recorded, rollback tested, and production smoke test passed.

## 5. Required verification matrix

| Scenario          | Minimum assertion                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/security     | Cookie scope and rotation, no token in props/history, unauthorized deep link, expired access token, invalid refresh, logout/password revocation, CSRF rejection, bearer-only APIs unchanged |
| Form failure      | Same field values and visible errors after failed validation, including checkboxes, nested arrays, rich text and multi-form pages; attached files handled as before                         |
| Content lifecycle | Create, edit, draft, publish, archive, delete, preview, dependency failures, audit entry and public API result for each content type                                                        |
| Lists             | Search, filters, sort, pagination, empty result, query URL, browser back/forward and deep link                                                                                              |
| Images            | JPEG/PNG/WebP, invalid/oversize limits, max count, cover/gallery/poster/hero/logo/category type, reorder/alt text, private visibility, replace/remove and orphan cleanup                    |
| Editors           | Quill plain/HTML transition, sanitization, bilingual content and RTL fields; hours unknown/closed/open, split and overnight interval payloads                                               |
| Shared UX         | Shell/nav, save-success timer, flash once, confirmation cancel/accept, dirty-form navigation guard, mobile drawer, focus and keyboard behavior                                              |
| Build/operations  | `npm run typecheck`, `npm run lint`, `node ace test functional`, browser suite, `npm run build`, production boot, asset versioning and rollback                                             |

Use database assertions for writes and browser assertions for the rendered flow. A server-only test cannot prove FilePond, Quill, navigation, or dirty-form behavior. Keep the existing separate `kuwaitiexperience_test` database safeguard.

## 6. Risk register and mitigations

| Risk                                              | Level       | Mitigation / release gate                                                                                                         |
| ------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Cookie JWT refresh and Inertia redirect semantics | High        | Test expired token during GET and POST; preserve original action or clear failure; verify logout/history and account invalidation |
| CSRF under fetch and multipart                    | High        | Configure and exercise real browser requests; assert mutation is rejected without a valid token; keep `/api/*` exclusion          |
| Hidden state in complex forms                     | High        | Baseline every field and nested payload; use typed adapters and retained-input tests for failed submissions                       |
| Image file lifecycle                              | High        | Use existing server image services; verify limits, access rules, transaction cleanup and ownership in tests                       |
| Quill/FilePond React lifecycle                    | Medium-high | React wrappers with cleanup; verify remount, repeat edit, route navigation and localized content                                  |
| CSS and interaction parity                        | Medium-high | Preserve classes/tokens initially, use screenshot and keyboard comparisons, then remove old DOM scripts                           |
| Sparse browser coverage today                     | High        | Add baseline browser tests before migration, then reuse the same flows for React                                                  |
| Accidental API/business-rule change               | Medium      | Keep validators/services/schema unchanged; contract tests and database effect comparison                                          |

## 7. Effort and sequencing

Budget **8–12 engineer-weeks** for one experienced React/AdonisJS engineer, plus **1–2 QA weeks** overlapping the final phases. The earlier 6–10 week rough estimate grows because the current repo has no browser suite and the exact-parity requirement needs baseline coverage before conversion. Two engineers can work on independent modules after Phase 2, but foundation, shared controls, and final integration remain sequential.

| Phase                            | Engineer-weeks |
| -------------------------------- | -------------: |
| Baseline and parity ledger       |          1–1.5 |
| Foundation and high-risk proof   |          1–1.5 |
| Shared shell and controls        |          1–1.5 |
| Module waves                     |            3–5 |
| Regression, cutover and rollback |        1.5–2.5 |

Do not schedule the production cutover by date alone. The release gates above determine readiness.

## 8. References

- [AdonisJS Inertia guide](https://docs.adonisjs.com/guides/frontend/inertia): existing-app setup, typed pages/forms, flash/errors, CSRF, redirects, history and SSR.
- [Current CMS routes](../start/routes.ts), [browser controllers](../app/controllers/admin/), [CMS views](../resources/views/admin/), [CMS functional tests](../tests/functional/cms_pages.spec.ts).
