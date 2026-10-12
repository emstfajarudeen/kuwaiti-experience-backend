---
inclusion: auto
name: Architecture and API conventions
description: Use when changing routes, controllers, services, validators, middleware, or JSON/API behavior.
---
# Architecture and API conventions

- Register endpoints in `start/routes.ts` and keep route groups explicit. Public routes live under `/api/v1`; admin JSON routes live under `/api/v1/admin`; browser CMS routes live under `/admin`.
- Keep controllers thin: validate with the existing VineJS validators, call a shared service for behavior, and return the established response shape. Put reusable queries, serialization, transactions, authentication, and domain rules in `app/services` rather than duplicating them in controllers.
- JSON success responses use a `{ data: ... }` envelope; paginated place lists also use `meta`. Errors are normalized by `app/exceptions/handler.ts` as `{ error: { code, message, requestId, fields? } }`. Use `ApiError` and existing status/code conventions instead of ad-hoc error bodies. Successful deletes use `204`.
- Preserve locale behavior: accept `en` and `ar`, default invalid or missing locale to English, and use independent Arabic-to-English fallback where the public service already does so. Public content must exclude drafts, archived records, and future publication dates; admin preview may expose drafts.
- Protected `/api/v1/admin` routes require `Authorization: Bearer <accessToken>` and the `jwtAdmin` middleware. API requests deliberately reject CMS cookies; browser `/admin` requests use the HttpOnly cookie path and redirect unauthenticated HTML requests to `/admin/login`.
- Keep browser form writes protected by Shield CSRF and use redirects/flash handling consistent with the CMS. Do not bypass middleware or weaken authentication to make an endpoint easier to call.
- Bound and validate all new input with VineJS and existing domain checks. Preserve rate-limit middleware on login/refresh, enquiry, and media-upload paths when changing those endpoints. Update `docs/openapi.yaml` when an API contract changes, then verify it against `start/routes.ts` and controllers.
