---
inclusion: auto
name: Authentication and security requirements
description: Use when changing authentication, sessions, cookies, authorization, uploads, CSRF, secrets, or security-sensitive configuration.
---
# Authentication and security requirements

- Keep `APP_KEY` and `JWT_SECRET` independent and supplied through environment configuration. Never commit credentials, tokens, passwords, `.env`, or uploaded files. Required runtime variables and allowed values are defined in `start/env.ts` and `.env.example`.
- Admin API login issues HS256 access JWTs lasting 15 minutes and a seven-day session-backed refresh token. Store only SHA-256 refresh-token digests, rotate refresh tokens, detect reuse, revoke sessions on logout/password change, and verify issuer, audience, expiry, active admin status, and live session on every request.
- Browser CMS authentication uses signed HttpOnly `admin_access` and `admin_refresh` cookies scoped to `/admin`; production cookies are Secure and SameSite=Lax. API clients must use bearer tokens, not browser cookies or local storage. Reject simultaneous or cross-channel credentials as current middleware does.
- Keep Shield CSRF protection for non-GET browser forms. Do not treat API bearer authentication as a reason to disable browser CSRF, secure headers, no-store admin responses, or request throttles. Current CSP is explicitly disabled in `config/shield.ts`; do not claim CSP protection without changing and verifying that configuration.
- Maintain bounds for login/refresh, public enquiry, uploads, pagination/search, URLs, transport dates, and decoded image dimensions. Treat stored rich text as untrusted because this repository has no dedicated rich-text sanitizer pipeline.
- Production operations must use `LIMITER_STORE=database`, persistent uploads, TLS/reverse-proxy controls, least-privilege MySQL credentials, and planned secret rotation. The health endpoint proves HTTP availability only; it is not a database health check.
