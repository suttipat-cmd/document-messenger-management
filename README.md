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

Local URL: http://127.0.0.1:5173/document-messenger-management/

`.env.example` contains the project URL and a **publishable** key, which is designed for frontend use. The client rejects secret and legacy JWT keys. Never add Google credentials, database passwords, service-role keys, or `sb_secret_` keys to Vite environment variables or frontend code. `.env.local` is ignored.

## Current phase

Supabase Auth, RLS, persistent jobs/stops/route order, server-generated event history, optimistic version checks and Realtime are connected. Data loading is paginated and refreshes on window focus. Mutations wait for the backend; errors never substitute demo jobs or invent success. Realtime notifications are batched to reduce duplicate fetches.

**Photo evidence is optional in this phase and attachment is disabled.** The UI reserves a clearly labelled placeholder. No files are uploaded or stored. Physical return still requires an explicit confirmation before the job closes. Google Workspace Drive integration and mandatory photos are a later phase.

Demo mode is an explicit separate choice on the login screen. Demo changes are memory-only and do not create backend data.

## Roles and onboarding

- **Admin:** all visible jobs, management job creation, account names/roles/activation, operational actions. Removing the last active Admin is rejected.
- **Super User:** all visible jobs, management job creation and operational actions; cannot manage account permissions.
- **Messenger:** only assigned jobs; accept, freely reorder stops across active jobs, complete/retry stops, and confirm physical document return.
- **Public requester:** public submission form and its restricted backend endpoint remain pending; anonymous visitors currently cannot read or mutate operational data.

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
- Auth Site URL currently points to the local application above. Update it and the redirect allowlist when deploying GitHub Pages.

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

GitHub Pages hosts the frontend only. Supabase Free provides PostgreSQL, Auth, RLS, Realtime and future Edge Functions. All future documents and evidence photos belong in Google Workspace Drive, accessed through authorized backend endpoints. Do not add Supabase Storage or another hosting/storage provider for those files. Public form field design, the public submission endpoint, full desktop management, Drive and GitHub Pages deployment remain subsequent work.
