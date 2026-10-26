# CMS UI audit and implementation plan

## Goal

Make every CMS screen use the same restrained visual system and Ant Design controls, while preserving existing forms, permissions, validation, and uploads.

## Audit scope

Review desktop and narrow layouts for: authentication/account; dashboard; places and preview; categories and category types; pages; features, movies, showtimes, and explore places; contact requests; homepage, transport, and site settings; registered app users; staff; and roles/permissions. Check list, create, edit, detail, empty, error, and validation states where available.

## Findings to address

1. Global CSS applies native `select` backgrounds too broadly, producing repeated arrows on dropdowns. Generic form rules also compete with Ant Design styles.
2. Image forms use a mix of FilePond and native file inputs. The native control shown in the screenshots is unstyled.
3. Category form fields and the publishing action do not share a clear grid or baseline; empty vertical space is excessive.
4. Staff and other list filters have uneven labels, widths, and whitespace.
5. Staff and Roles pages lack the contained panels, table spacing, button contrast, and form hierarchy used elsewhere.
6. Several page headers repeat descriptive copy and section labels that add no task value.

## Implementation sequence

### 1. Shared UI contract

- Keep the existing navy, ivory, gold, Manrope, and Ant Design provider tokens.
- Define consistent page headers, surfaces, form sections, filter bars, table wrappers, field spacing, actions, empty states, and responsive breakpoints in shared components/CSS.
- Scope legacy CSS to native controls that still need it. Avoid selectors that alter Ant Design internals. Ensure primary buttons have readable foreground colors in all states.
- Use concise labels; remove decorative subtitles and redundant introductions unless they explain a required decision or security consequence.

### 2. Inputs and uploads

- Use Ant Design `Input`, `InputNumber`, `Select`, `Checkbox`, `Switch`, `DatePicker`/time controls, and `Form.Item` where appropriate for visible form controls. Preserve names, submitted values, server errors, required state, RTL text, and keyboard access.
- Replace FilePond and the category-type native file input with one reusable Ant Design `Upload` component for single and multiple images. Include preview, remove/replace, type and size checks, and accessible status. Preserve multipart submission and each backend field name.
- Use a consistent password control and text editor wrapper where specialized behavior is needed.

### 3. Page families

- **Content forms:** repair Category alignment, Place selects, image fields, and action placement; apply the same spacing to category types, pages, explore content, homepage, transport, and settings.
- **Lists:** unify search/filter/action layout on Places, Categories, Category Types, Pages, Movies, Showtimes, Contacts, registered Users, Staff, and Roles. Align labels with controls, avoid large gaps, and make filters usable at narrow widths.
- **Access management:** rebuild Staff list/edit and Roles list/create/edit/detail using the shared panels, compact permission groups, clear action states, and consistent table cells. Preserve RBAC behavior.
- **Remaining screens:** audit account/auth, dashboard, preview, detail, success, and error pages for inconsistent controls, spacing, and redundant copy.

### 4. Verification

- Run TypeScript and production build checks.
- Exercise navigation and representative list, filter, validation, create/edit, and upload flows in the local CMS at desktop and narrow viewport sizes. Check select hover/focus, file selection/removal, category alignment, Staff/Roles forms, and permission-sensitive controls.
- Run relevant existing tests when practical; inspect console/server errors. Fix regressions found during verification.

## Completion criteria

All visible file inputs use the shared Ant Design upload control; selects show one arrow; form and filter alignment is consistent; Staff/Roles match the CMS visual language; necessary actions remain functional and accessible; no page retains redundant explanatory copy or an obvious styling exception.

## Verification status

- Shared styling, form controls, uploads, and the named page layouts have been updated. The remaining native textarea is the source field for the Quill editor; the native file input is hidden and used only to submit files selected through Ant Design Upload.
- TypeScript and production build pass. The CMS React authentication functional suite passes (3 tests).
- The older CMS pages and staff management functional suites return 403 because their fixtures create legacy `role: 'admin'` users without RBAC role grants. These failures are outside the UI changes and need fixture migration.
- Live visual verification is pending: the local browser has no authenticated session, and the previously provided password is rejected by the local CMS.

## Form action placement revision

The full-width editor layout exposed seven save-only action cards at the bottom of Category, Category Type, Place, Page, Movie, Homepage, and Site Settings forms. Staff, Role, Feature, Showtime, Transport, Explore Place, Account, and Contact Status forms also have footer actions. These should use a consistent header pattern.

1. Add a shared form page header with the title on the left and Save/Cancel (or the applicable primary and secondary actions) on the right. On long forms, keep this header compact and sticky beneath the CMS top bar. On narrow screens, let the controls wrap without covering fields.
2. Remove save-only Publishing/Actions cards. Keep image previews and other actual form content in ordinary panels. Place any destructive action separately, with its existing confirmation.
3. Give each form a stable ID and connect header submit controls through the HTML `form` attribute. Preserve Ant Design validation, loading, CSRF submission, and keyboard Enter behavior. For Place forms with Save draft/Publish intents, derive the intent from the clicked submitter rather than relying on an asynchronous state update.
4. Apply the same header pattern to the smaller inline editors. Preserve existing Cancel destinations and distinguish navigation from a true discard action; warn before leaving only when there are unsaved changes.
5. Verify create/edit flows, validation errors, multi-action Place/Page forms, loading/disabled states, permission-based visibility, keyboard access, and narrow layouts. Ensure the sticky bar does not obscure the first error or form controls.
