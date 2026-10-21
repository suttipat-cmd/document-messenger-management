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
