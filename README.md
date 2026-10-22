# Document Messenger Management System

Mobile-first React + TypeScript + Vite workspace for approximately 1–20 internal users.

## Run

```sh
npm ci
cp .env.example .env.local
npm run dev
npm test
npm run build
npm run lint
```

Production: https://suttipat-cmd.github.io/document-messenger-management/

Local URL: http://127.0.0.1:5173/document-messenger-management/

`.env.example` contains the project URL and a **publishable** key, which is designed for frontend use. The client rejects secret and legacy JWT keys. Never add Google credentials, database passwords, service-role keys, or `sb_secret_` keys to Vite environment variables or frontend code. `.env.local` is ignored.

## Current phase

Supabase Auth, RLS, persistent jobs/stops/route order, server-generated event history, optimistic version checks and Realtime are connected. Data loading is paginated and refreshes on window focus. Mutations wait for the backend; errors never substitute demo jobs or invent success. Realtime notifications are batched to reduce duplicate fetches.

Photo evidence is optional and now supported through the authenticated Supabase Edge Function → signed Apps Script → Google Drive bridge. Messenger can capture/select up to five images per stop and per physical return. Physical return still requires explicit confirmation.

Demo mode is an explicit separate choice on the login screen. Demo changes are memory-only and do not create backend data.

## Roles and onboarding

- **Admin:** all visible jobs, management job creation, account names/roles/activation, operational actions. Removing the last active Admin is rejected.
- **Super User:** all visible jobs, management job creation and operational actions; cannot manage account permissions.
- **Messenger:** only assigned jobs; accept, freely reorder stops across active jobs, complete/retry stops, and confirm physical document return.
- **Public requester:** use https://suttipat-cmd.github.io/document-messenger-management/#/request without signing in. Choose an active Messenger, enter requester contact and 1–20 pickup/delivery stops, review and submit. The receipt contains only a job code; visitors cannot read or edit operational jobs. An Admin must activate at least one Messenger first.

The approved initial Admin is `suttipat@forwardinsight.co.th`. A private, one-time bootstrap activates Admin only when Supabase Auth verifies that exact email. User-editable metadata never determines permissions. The bootstrap is consumed after use. All other signups start as inactive Messengers, regardless of supplied metadata.

1. Create an account and verify its email, then sign in.
2. Admin opens **จัดการบัญชีผู้ใช้** and activates the verified company's users, assigns roles and sets names.
3. Admin/Super User opens **สร้างงาน**, selects an active Messenger and adds pickup/delivery stops.
4. Messenger signs in on their own device and receives only their assignments.

The first Admin has signed in successfully against the live project. Supabase's default email sender has development restrictions; use Dashboard provisioning or configure company SMTP when onboarding addresses outside the project's permitted team. Password resets and broader admin job editing/cancellation/reassignment are not yet implemented.

## Supabase deployment

- Organization: `patcharee@effcl.com's Org` (Free)
- Project: `document-messenger-management`
- Reference: `lhyxpdlariunsyzxbtsa`
- URL: https://lhyxpdlariunsyzxbtsa.supabase.co
- Actual region: `ap-south-1` (Mumbai)
- Auth Site URL points to Production. The exact Production and local URLs above are in the redirect allowlist.

SQL in `supabase/migrations/` was created with the Supabase CLI and applied in order through the Dashboard SQL Editor because the connected MCP account does not have access to this project. These scripts are **already applied** to the live project. They are not registered in CLI migration history; reconcile the baseline before using `supabase db push` against this existing database. Apply in order to a fresh project instead of rerunning the initial table-creation migration on this one.

Tables: `messenger_profiles`, `messenger_jobs`, `messenger_stops`, `messenger_events`. All have RLS and no anonymous grants. Authenticated clients have SELECT only; writes use narrow, transactional RPC wrappers. The underlying functions are in non-exposed `messenger_private`, with explicit execute grants, fixed search paths, identity/role/ownership checks and server-generated history. Role changes take effect from database-owned profiles rather than editable JWT user metadata.

RPCs: `messenger_command`, `messenger_reorder`, `messenger_create_job`, `messenger_set_profile`. The Data API must expose only the usual public API schema; do not expose `messenger_private`. All four public tables are published to Supabase Realtime.

## Verification

- Component tests: acceptance/search/cross-job reorder, photo-free retry/completion/return, returned-job read-only behavior, backend failure behavior, Auth login and inactive account gating.
- `supabase/tests/security.sql`: live transaction tests for cross-user isolation, anonymous denial, no direct table writes, stale-version rejection, physical return and audit trail.
- `supabase/tests/manager_and_completion.sql`: live transaction tests for metadata privilege rejection, verified one-time bootstrap, profile activation, manager creation, reorder and completion without photos.
- SQL tests roll back all temporary users/jobs; they do not set passwords or send email.
- Live HTTP probes with the publishable key: anonymous table reads and commands return 401 / 42501.
- Mobile viewport checks at 360px and 390px; prior tablet checks at 768px. Physical smartphone camera testing is deferred with photo integration.
- Security Advisor: 0 errors after restricting public access to Supabase's automatic-RLS helper. The remaining Auth warning is disabled leaked-password protection; no paid-plan upgrade was made.

## Architecture constraints

GitHub Pages hosts the frontend only. Supabase Free provides PostgreSQL, Auth, RLS, Realtime and Edge Functions. All future documents and evidence photos belong in Google Workspace Drive, accessed through authorized backend endpoints. Do not add Supabase Storage or another hosting/storage provider for those files. Apps Script is the approved Google integration bridge, running as its owner with a fixed destination folder. Files never pass through Supabase Storage.

## GitHub Pages

The repository is public by owner approval. `.github/workflows/deploy.yml` tests, lints, builds and deploys on pushes to `main`, with manual dispatch available. Only the Supabase publishable configuration is embedded. GitHub Pages serves `dist` over HTTPS; the backend remains Supabase. The initial production deployment passed all jobs.

### Public intake

`public-job-request` is an intentionally anonymous Edge Function (`verify_jwt = false`). It validates input and calls service-role-only RPCs; anonymous clients have no direct table or RPC access. Only active Messenger IDs and display names are exposed. Server credentials remain in Supabase automatic environment variables. POST requests are limited to 32 KB, 1–20 stops, 30 requests per network bucket per 10 minutes, 60 globally per 10 minutes and 300 per Bangkok day. Network buckets are best-effort abuse controls, not identity verification. UUID request keys make retries idempotent, including after uncertain network errors. No requester data is persisted in browser storage.

Apply `20261021182258_public_job_intake.sql`, then deploy `supabase/functions/public-job-request/index.ts`. The SQL was applied through Dashboard and is not yet in CLI migration history. `supabase/tests/public_intake.sql` checks grants, roster minimization, atomic creation, duplicate prevention, validation and throttling in a rolled-back transaction. All 11 UI tests, build and lint pass.


### Compact management workspace and monthly numbers

Admin and Super User use a desktop management workspace with status counts, search, filters and a job detail panel. Admin account controls live on a separate tab. Operational commands remain available in the detail panel; Messenger keeps the mobile workspace. Public intake uses denser desktop fields and mobile touch targets. Loading feedback covers initial authentication, workspace refresh, mutations, roster loading, submission and logout.

Job numbers use `MSG-YYMM0001`, reset by Bangkok calendar month. A private counter is incremented atomically in the job insert trigger for both manager and public intake. Four-digit capacity is 9999 jobs/month; the database rejects overflow rather than reusing a number. Existing legacy codes were converted in creation order; internal UUID relationships are unchanged. Migration `20261021184224_monthly_job_numbers.sql` was applied through Dashboard; reconcile CLI migration history before any db push. Rollback checks live in `supabase/tests/monthly_job_numbers.sql`.


### Department master, job dates and accepted-job access

The department dropdown is sourced only from `Section Master.xlsx` (Query result!A2:A34). Whitespace and obvious spelling were normalized, English department labels translated to Thai, and three duplicate pairs merged: 33 source rows yield 30 choices. `supabase/department-source-map.json` preserves the source-to-display mapping; `src/data/departments.json` supplies both forms. A private database master rejects unlisted departments on new jobs. Historical department values are retained.

Both forms require department and a job date (Bangkok today by default). Requester phone and stop addresses are optional. Job dates are stored separately from creation timestamps; existing jobs use their Bangkok creation date. Manager creation uses the dated RPC overload; public intake forwards `jobDate`. The date constraint rejects infinity and unsupported years.

After acceptance, Admin and Super User retain read access only: operational command and reorder RPCs reject their mutations under the job row lock, and the UI removes action controls. Messenger operations remain unchanged. New rollback verification: `supabase/tests/fields_and_accepted_permissions.sql`. Both 20261021190611 and 20261021191158 migrations were applied through Dashboard; reconcile CLI migration history before db push. Tables show ordinal, job date, code, title, department, requester, messenger, status and progress. Status summaries and badges use matching colors. Interface terminology is Thai; proper names and source department codes remain unchanged.


### Single form and service management naming

The display name is ระบบบริหารงานบริการ (short sidebar label: บริหารงานบริการ), leaving room for future service types. The header action แบบฟอร์ม links directly to https://suttipat-cmd.github.io/document-messenger-management/#/request. The separate authenticated creation form, its frontend API helper, and the duplicate form navigation item have been removed; all UI submission now uses the same public form and protected Edge API. The older database creation RPCs remain for backwards compatibility.

Management filters combine text search, status, department, assignee and an inclusive job-date range. Assignee selection uses account IDs, and department options reflect existing jobs so historical department names remain filterable. Today and clear-all controls support quick changes. Reversed date ranges show an error rather than silently changing the dates. Records without a job date are excluded when date filters are used.

### Design System application

The 31 JPG references in `Design System (Community).zip` define component appearance/states, with the supplied semantic palette taking precedence over the ZIP's purple examples. `src/design-system.css` owns the design tokens: Primary #4778B3, Secondary #B38247, Info #106BDA, Warning #FFC107, Danger #CE3426, Success #157F40, Neutral #767676/#444444. Derived ink/tint colors keep warning and secondary text readable. Noto Sans Thai supports Thai text; desktop data uses 14px text and mobile form fields use 16px. Desktop controls are compact, while mobile actions retain at least 48px targets.

Applied components include buttons and states, fields/dropdowns with Thai inline validation, status badges, filter chips, cards/lists, SVG line icons, avatars, toggle switches, tabs, breadcrumbs, steppers, progress bars, loaders, skeletons, alerts, toasts, confirmations and mobile action sheets. Existing status filters serve as button groups. Native date/select controls retain platform keyboard and mobile behavior. Radio inputs and dot page controls are not inserted into flows that do not need them.

Management pagination renders 10/20/50 filtered jobs per page with continuous row ordinals and resets to page one when filters change. It operates on the existing authorized workspace snapshot; it does not change database pagination or RLS. Job detail tabs support arrow-key navigation. Filter chips can be removed individually. Empty states distinguish no jobs from no matches and offer the relevant next action.

A native modal confirmation is required in the UI before role/activation changes and before final physical-return confirmation. The former shows the target account and intended values; pending dialogs block cancellation. These UI confirmations do not replace backend authorization. Mobile Messenger uses a bottom action sheet for retry/return, retaining reason validation and existing job rules. Google Drive evidence capture is enabled through the protected bridge.

Public submission is code-split with a skeleton fallback. Form validation keeps native validity rules, adds Thai inline messages/ARIA errors and focuses the first invalid control without browser-language popovers. Success toasts follow confirmed operations and refreshed data; errors remain persistent. Shared feedback tests cover validation, confirmation/cancel, toast timing and pagination. Browser review covers desktop, form error states, native modal focus, and Messenger at 360/390px using disposable local previews.


## Google Drive evidence

- Destination: `11Iyc7T1iJdhRzUOmow_rIUx8bvu8om1O` in the company account’s My Drive.
- Deploy `supabase/functions/messenger-evidence/index.ts` with JWT verification enabled. The handler additionally verifies the actual user with Supabase Auth and database-owned roles. API keys alone never authorize access.
- Set `DRIVE_BRIDGE_SECRET` in Supabase Secrets to the Apps Script `BRIDGE_SECRET`. Never place it in source, a Vite variable, logs, or chat. Apps Script code/setup is in `integrations/apps-script/`.
- Apps Script executes as its owner; its Web app accepts signed backend POSTs only. Requests expire after two minutes, nonces discourage replay, responses are also signed, and reads are restricted to the fixed folder and recorded image hash. No public file URLs or permissions are created.
- Original images up to 20 MiB/48 megapixels are decoded on the device, resized to at most 1600px on the long edge, and encoded as JPEG (white background, quality 0.85). Re-encoding strips original EXIF metadata. Only the resized image is sent; final file size is limited to 2 MiB. Unsupported formats such as HEIC on browsers without a decoder show an error.
- Public `messenger_evidence` contains metadata only, protected with job-level RLS. Private upload reservations store Drive IDs and SHA-256 digests. Only service-role RPCs can publish metadata; only the assigned active Messenger can upload to an unfinished stop or a returning job. Managers have read-only access after acceptance. Anonymous requesters cannot upload or read photos.
- Stable IDs derived from the prepared image and target make retries idempotent. The frontend retains the prepared Blob for retry after uncertain results. Upload and completion remain separate actions; wait for upload success before completing a stop.
- A cross-device job transition after Drive upload can prevent metadata publication; the file then remains a private orphan with its reservation for administrative reconciliation. Pending reservations count toward the five-image cap. Deletion/replacement and automated orphan cleanup are not implemented. Existing photos are append-only through the app.
- Viewing/downloading fetches bytes through the authenticated Edge Function, rechecks RLS before delivering them, and uses temporary browser Blob URLs that are revoked on close. No Google access token, shared secret, or Drive file ID is returned to the frontend.
- Verification: `npm test`, `npm run lint`, `npm run build`; `npx deno check supabase/functions/messenger-evidence/index.ts`; `npx deno test --allow-env supabase/functions/messenger-evidence/index_test.ts`; and the rolled-back database test `supabase/tests/drive_evidence.sql`.
- Apps Script availability and quotas apply. Physical phone camera capture still needs device acceptance testing. Existing photos are not made mandatory by this feature.
