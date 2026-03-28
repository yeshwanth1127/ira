# IRA Current-to-Target Architecture Map

## Backend mapping

- `backend/src/index.ts` -> **composition root** (`config`, middleware chain, route mounts, health).
- `backend/src/routes/*` -> **transport layer only** (request parse/response shape).
- `backend/src/services/*` + `backend/src/licensing/*` -> **business logic layer**.
- `backend/src/db.ts` + new `backend/src/repositories/*` -> **data access layer**.
- `backend/src/auth/*` + `backend/src/middleware/*` -> **cross-cutting middleware**.
- `backend/migrations/*` -> **schema evolution**.

## Desktop mapping

- `desktop/src-tauri/src/lib.rs` + `desktop/src-tauri/src/db.rs` -> **native command boundary + SQLite context source of truth**.
- `desktop/src/ExactIraUI.tsx` -> **main input/orchestration shell**.
- `desktop/src/ResponseWindowUI.tsx` -> **response + chat history surface**.
- `desktop/src/SettingsWindowUI.tsx` -> **account/license/usage surface**.
- `desktop/src/WindowRouter.tsx` -> **window label routing** (`main`, `response`, `settings`).

## Refactor tasks

1. Move SQL out of routes into repositories:
   - `auth.ts`, `licenses.ts`, `me.ts`, billing webhook persistence.
2. Add unified middleware chain:
   - request id, structured request log, centralized error envelope.
3. Keep route contracts stable while internal layering changes.
4. Finalize local SQLite context lifecycle:
   - create conversation, append user/assistant, build context for `/chat`, log call usage/error.
5. Bind settings + response/history to same conversation ids.

