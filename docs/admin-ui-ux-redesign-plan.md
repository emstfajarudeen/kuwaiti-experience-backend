# Admin CMS UI/UX redesign — implementation plan

Status: **proposed for implementation**. This document records the 21 October 2026 review of the existing CMS and eight supplied screenshots. It is a handoff plan, not a record of completed UI changes.

## 1. Goal and scope

Make the admin CMS feel like a clear, efficient content workspace while preserving all current functions and data contracts. Redesign the overview, lists, place editing, feedback, and remaining admin screens as one coherent system. The public website and public/mobile API appearance are outside this work.

The visual direction is a **refined editorial operations workspace**: retain the Kuwaiti Experience navy, warm neutral background, and gold accent, but use stronger information hierarchy, more readable type, restrained decoration, and predictable actions. Do not invent traffic, revenue, bookings, or other metrics without a real data source.

### Evidence from the screenshots and code

| Area         | Current issue                                                                                                                                                                       | Relevant implementation                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview     | Similar count cards dominate; recent events show IDs and raw timestamps, leaving little sense of work needing attention.                                                            | `resources/views/admin/dashboard.edge`, `app/controllers/admin/dashboard_controller.ts`                                                                           |
| Lists        | Text and row actions are too small; raw timestamps are long; the arrow-only action does not explain its destination. The Places query caps results at 100 without pagination.       | `resources/views/admin/places/index.edge`, `resources/views/admin/categories/index.edge`, `resources/css/admin.css`, `app/controllers/admin/places_controller.ts` |
| Place editor | A long form separates the editor from save/preview/status actions. Preview, archive, and delete sit after the gallery; the Explore editor is a separate route with weak wayfinding. | `resources/views/admin/places/edit.edge`, `resources/views/admin/explore/place.edge`                                                                              |
| Weekly hours | At least 21 rows render, mostly as “Unused,” before the editor has chosen any day.                                                                                                  | `app/controllers/admin/explore_controller.ts`, `resources/views/admin/explore/place.edge`                                                                         |
| Feedback     | Every flash notice is replaced by a toast, including errors; the original inline notice is removed.                                                                                 | `resources/views/components/layouts/admin.edge`, `resources/js/admin_components.js`                                                                               |
| Forms        | Small labels and controls, inconsistent save-button widths and spacing, oversized image drop areas, and inconsistent checkbox placement recur across screens.                       | `resources/css/admin.css` and admin Edge views                                                                                                                    |
| Components   | Native controls are replaced with Web Awesome elements after load. This makes layout, form behavior, and progressive states harder to reason about.                                 | `resources/js/admin_components.js`                                                                                                                                |

## 2. Non-negotiable preservation rules

1. Keep existing CMS URLs, signed admin sessions, CSRF protection, POST semantics, validators, and public API behavior. Any new search/pagination endpoints or query parameters should be additive.
2. Preserve place draft/published/archived states; create, edit, preview, save draft, save and publish, archive, and permanent delete. Preserve the cover-image requirement for publishing.
3. Preserve category/category-type CRUD, ordering, visibility, tile images, and existing deletion constraints.
4. Preserve English and optional Arabic fields, RTL entry, fallback behavior, SEO fields, featured ordering, gallery metadata/order/removal, and record-owned upload limits/conversion.
5. Preserve Explore phone, hotel check-in/out, theater screen count, feature assignments, and weekly-hour semantics: unknown, explicitly closed, split intervals, next-day closing, non-overlap, weekday/order uniqueness, and the 70-interval validator maximum.
6. Preserve pages, movies, showtimes, contact requests, homepage cards, transport, settings, account/password, and logout workflows.
7. Preserve submitted data and show recoverable errors. For file-upload failures, continue telling editors when files must be reselected.
8. Do not make irreversible actions easier to trigger accidentally. Keep a confirmation dialog and clear destructive wording.

Before replacing a view, record its current route, request field names, validation rules, and success/error redirects. Use that inventory as a regression checklist.

## 3. Shared design and interaction system

### Layout and visual rules

- Define semantic CSS tokens for background, surfaces, borders, text, muted text, success/warning/error, spacing, radius, focus, and control sizes in `resources/css/admin.css`. Stop adding one-off inline styles to views.
- Use a 4/8 px spacing rhythm. Prefer a readable content measure for forms, while allowing data tables to use available width. Make a consistent page header: title, short context, status when relevant, and the primary action.
- Raise normal text to approximately 14–16 px and labels/table content to at least a comfortably readable size. Reserve 9–11 px lettering for rare decorative metadata, not working information.
- Use one icon family with descriptive visible labels for key actions. Replace decorative ↗ arrows as the only action cue.
- Provide clear hover, pressed, loading, disabled, and keyboard-focus states. Aim for approximately 44 px click/tap targets, including table actions; verify WCAG 2.2 AA contrast and minimum target-size requirements.
- Keep the desktop sidebar. On narrow screens, use a compact accessible navigation drawer rather than two horizontally scrolling nav rows. Check zoom and reflow without horizontal page scrolling.
- Use consistent empty, loading, error, and no-results states. Each should tell the editor what to do next.

### Components

- Reuse the installed **Web Awesome** components for fields, selection, checkboxes, dialogs, dropdown action menus, and lightweight toasts; **FilePond** for uploads; **Quill** for formatted page content. A new component framework is not required for the first pass.
- Migrate screen by screen from generic post-load DOM replacement in `resources/js/admin_components.js` to explicit components in Edge markup. Preserve form names, values, validation, and server submission while migrating. Do not switch every screen at once.
- Use semantic HTML tables for tabular data, with Web Awesome controls for filters and actions. Use labelled primary links when a row has only one action; use a keyboard-accessible menu for multiple actions.
- Standardize status badges and confirmation dialogs. Place destructive actions last and visually separate from routine actions.

### Feedback rules

- A successful save may use a concise Web Awesome toast, paired with a visible updated state on the page. Use a single, consistent toast position, readable width, icon/status styling, and a dismiss control.
- Keep validation errors and failed saves **inline**: a visible summary near the page/form header and field-level errors when a field is known. Do not remove these messages to display only a toast. An error must persist until resolved or dismissed.
- For longer operations, disable duplicate submission and show progress without obscuring the form. Make an action available on the page even if a transient toast mentions it.
- Review all flash-message paths so create/edit/delete/publish/upload outcomes use the same rules.

## 4. Screen specifications

### A. Overview

Replace the current five equal cards with an overview that answers: **What is live? What needs work? What changed? What should I do next?**

1. Show compact total/published/draft/archived place counts using real `places` data; show type breakdown as a secondary section, not another full row of large cards.
2. Add an attention area for actionable existing records, such as drafts and open contact requests. Only show a count if the source and definition are confirmed. Link directly to the relevant filtered list.
3. Render recent audit events with readable action labels, entity names where available, and Kuwait-local dates. Link an event only when its target still exists; show a clear deleted-record label otherwise.
4. Keep “Add a place” prominent and group quick links by actual editorial tasks. Avoid fabricated charts.
5. Ensure the overview still works when there are no places or no audit events.

### B. Lists and row actions

Apply a common list pattern to Places, Categories, Category types, Pages, Movies, Showtimes, Contact requests, and other tabular lists.

1. Put title/count, primary creation action, search, filters, and pagination in predictable positions. Preserve selected filters in the URL.
2. For Places, add server-side search, status/type filtering, sorting where useful, a true total, and pagination. Replace the current silent 100-row limit. Apply the same approach to other lists according to data volume.
3. Make the main record identity easy to scan: thumbnail when useful, name/title, supporting slug or type, status, and a concise “Edited 21 Oct 2026, 12:25 (Kuwait)” style timestamp. Retain a full date in a tooltip or accessible label if helpful.
4. Give rows a visible **Edit** link/button. Offer Preview and status actions only where routes and rules already support them. Use an **Actions** menu when there are multiple actions; do not show a menu for one link. Keep delete behind confirmation.
5. Retain table headers, meaningful sort state, keyboard navigation, and readable responsive layouts. On small screens, hide secondary columns or present a structured record card without hiding the primary action.
6. Differentiate an empty collection from “no results for these filters”; include reset/create actions.

### C. Place editing and preview

1. Add a stable place header with name, status, “Back to Places,” Preview, and appropriate save actions. Avoid leaving important actions after a long gallery.
2. Organize content into clear sections: Basics, English/Arabic content, Visit information, Media, SEO/Home placement, and Explore features/hours. A section index or tabs may be used, but unsaved changes must not be silently discarded while navigating.
3. Keep existing `/admin/places/:id/edit` and `/admin/places/:id/explore` save contracts. The two routes may look like one editor with clear section navigation; combining their backend writes is optional and should only follow a separate data-flow review.
4. Use a sticky or easily reachable save area that changes by state: Save draft / Save and publish before publication, Save changes when published. Keep cover-image publication guidance adjacent to the action.
5. Show the current cover and gallery in well-sized media cards. FilePond drop zones should be compact, have clear limits, and never overlap help text. Make image replacement/removal, alt text, captions, and ordering obvious.
6. Move Preview into the header/toolbar. Put Archive and Delete in a separate “Manage place” area or actions menu, with confirmation and exact consequences.
7. Current structured hours are also editable as raw `hoursJson` on the main form. Make the visual weekly-hours editor the primary route. Retain raw JSON in a clearly labelled Advanced area for parity until usage is reviewed; both must serialize to the same existing hour model.

### D. Explore weekly hours

Replace the 21-plus blank-row table with seven day sections. Each day starts in one of three states: **Unknown**, **Closed**, or **Open**. An Open day shows its existing intervals and an **Add interval** action. Provide per-interval start/end, next-day closing, and remove/reorder controls. Show split hours as multiple intervals for a day.

The client should submit indexed `place_hours` fields compatible with the current controller/validator or use an equivalent server-approved mapping. Preserve existing validation in `app/services/explore_write_service.ts`. Never silently convert “Unknown” into “Closed.” When validation fails, keep the day and interval data visible and identify the affected day/interval.

### E. Remaining editors

- **Categories/category types:** consistent form width, compact image preview/uploader, clearly grouped visibility and ordering, accessible deletion placement.
- **Pages:** clear language sections, Quill editor states, status and publish/archival actions within reach.
- **Features, movies, showtimes, transport, homepage cards:** separate creation from list management; use shared form/list/action patterns; preserve all status and selection rules.
- **Contact requests:** readable message/status views and obvious next action.
- **Settings/account:** constrained form width and deliberate button sizing/spacing. The password form must never put the button against the input border.
- **Login:** keep the existing password reveal affordance and accessible error placement.

## 5. Delivery phases and review gates

| Phase                            | Work                                                                                                                                          | Gate before proceeding                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0. Inventory                     | Map admin routes, forms, request fields, states, and screenshots. Capture desktop and narrow-width baselines.                                 | Complete functionality checklist with no unmapped save/delete/publish action.                  |
| 1. Foundations                   | Tokens, typography, shell/navigation, page headers, buttons, status badges, feedback, dialogs, responsive rules, explicit component examples. | Review one working sample of each shared pattern at desktop/mobile size and keyboard focus.    |
| 2. Representative vertical slice | Implement Overview, Places list, and Place editor. Add real counts, list query support, and action labels.                                    | Review visual result and complete place create/edit/publish/preview/archive/delete flows.      |
| 3. Explore                       | Redesign features and seven-day hours editor; reconcile advanced JSON display.                                                                | Verify unknown/closed/split/overnight hours, invalid intervals, and existing data round-trips. |
| 4. Remaining screens             | Apply approved patterns to all other admin views, with screen-specific adjustments.                                                           | Screen inventory covered; no legacy tiny arrow-only action or inaccessible form state.         |
| 5. Release verification          | Responsive, keyboard, zoom, contrast, smoke/end-to-end flows, build/typecheck/lint, and regression fixes.                                     | Reviewer signs off on every acceptance criterion below.                                        |

Use the Phase 2 screens as the design checkpoint. If their patterns are not working, adjust the shared system before rolling it across the CMS.

## 6. Acceptance criteria

- Every admin route remains reachable; every existing create/edit/publish/archive/delete/upload/form action still works with current server validation.
- Editors can identify the next action on Overview and locate, filter, and edit records from lists without decoding an arrow icon.
- No record disappears from the Places list because of the former 100-row cap; counts and pagination are accurate.
- Dates shown to editors are concise and explicitly based on `Asia/Kuwait` where visit/edit time context matters. Stored timestamps and API contracts remain unchanged.
- Place save/publish controls and Preview are reachable without scrolling past the entire form; destructive actions are separated and confirmed.
- Weekly hours display seven days rather than a wall of unused rows, preserve all existing hour states and limits, and round-trip saved data correctly.
- Success feedback is brief and understandable; failed saves and validation errors remain visible and actionable without relying on a toast.
- Forms and tables are usable by keyboard and at narrow widths and 200% zoom; focus is visible; controls have meaningful accessible names.
- No browser console errors, upload regressions, or silent form-serialization changes are introduced by the component migration.
- Production build, typecheck, lint, and relevant CMS functional/browser tests pass. Capture before/after screenshots for the representative screens and final responsive review.

## 7. Suggested file map

| Concern                            | Primary files                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared shell and flash messages    | `resources/views/components/layouts/admin.edge`                                                                                                                             |
| Shared styles/tokens               | `resources/css/admin.css`                                                                                                                                                   |
| Web Awesome enhancement and toasts | `resources/js/admin_components.js`, `resources/js/app.js`                                                                                                                   |
| Overview UI/data                   | `resources/views/admin/dashboard.edge`, `app/controllers/admin/dashboard_controller.ts`                                                                                     |
| Places list and query              | `resources/views/admin/places/index.edge`, `app/controllers/admin/places_controller.ts`                                                                                     |
| Place editor/media/status          | `resources/views/admin/places/edit.edge`, `resources/views/admin/places/preview.edge`                                                                                       |
| Explore editor/hour serialization  | `resources/views/admin/explore/place.edge`, `app/controllers/admin/explore_controller.ts`, `app/services/explore_write_service.ts`, `app/validators/explore.ts`             |
| Other views                        | `resources/views/admin/categories`, `category_types`, `pages`, `explore`, `contacts`, plus `home.edge`, `transport.edge`, `settings.edge`, `account.edge`, and `login.edge` |

Reference standards and component documentation: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Web Awesome dropdown](https://webawesome.com/docs/components/dropdown), and [Web Awesome toast accessibility guidance](https://webawesome.com/docs/components/toast).
