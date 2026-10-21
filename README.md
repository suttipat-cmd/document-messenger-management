# Document Messenger Management System

React + TypeScript + Vite. Mobile-first messenger workspace for 1–20 internal users.

## Development

```sh
npm ci
npm run dev
npm run build
npm run lint
```

## Required architecture

- GitHub Pages: frontend hosting only.
- Supabase Free: PostgreSQL, Auth, RLS, Realtime and Edge Functions.
- Google Workspace Drive: all documents and evidence photos.
- Upload, view and download must pass backend authorization; no public Drive links.
- Never place Google credentials or Supabase secret/service-role keys in frontend or VITE variables.
- No additional hosting or storage services without need.

## Roles and workflow

Admin manages everything, including accounts and roles. Super User manages all jobs, cancellation and messenger reassignment through desktop UI. Public requesters can only create jobs and select a messenger without an account; form fields remain to be designed. Messenger uses smartphone UI to accept assigned jobs, reorder stops freely and update each stop with photo evidence.

Jobs may contain multiple pickup/delivery stops with no precedence restrictions. Failed stops can be revisited. Returning a job includes physical document return and requires photo-confirmed handover before completion.

## UX acceptance

Bottom navigation, task cards, one-handed primary actions and minimum 48px touch targets. Validate full flows at 360px and 390px, plus other responsive sizes. Avoid horizontal overflow, wide tables and oversized modals.

## Current state

Project scaffold only. Backend, authentication, Drive integration and deployment are not configured yet. Next: interactive messenger prototype, then schema/RLS and backend integration.

## Messenger prototype — 22 October 2026

Interactive Thai mobile-first prototype: assigned work, acceptance, unrestricted stop reordering, per-stop photo selection, completion, retry reasons, physical return with photo confirmation, history and demo reset. Demo data and photos exist only in React memory and disappear on reload. No file uploads are sent to any server. Photos are limited to 15 MB each for this prototype.

Verified: build/lint; 360px and 390px with no horizontal overflow and visible enabled buttons at least 48px; acceptance, reorder, retry and physical-return states; photo-required buttons disabled without evidence. Full photo completion/camera capture still requires device testing: browser automation file selection was blocked by the extension file-access setting. Viewport tests simulate widths; physical smartphone testing remains pending.

## Supabase environment

- Organization: patcharee@effcl.com's Org (Free)
- Project: document-messenger-management
- Reference: lhyxpdlariunsyzxbtsa
- API URL: https://lhyxpdlariunsyzxbtsa.supabase.co
- Actual provisioned region: ap-south-1 (Mumbai), verified in dashboard.

The prototype does not yet connect to this backend. Do not use Supabase Storage for documents or evidence; use Google Workspace Drive through authorized Edge Functions. Public form fields and the database schema remain to be designed.
