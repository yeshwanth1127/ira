# IRA E2E Checklist (Auth -> License -> Activate -> Chat -> Usage)

Run from `ira/backend`.

## 1) Migrate and start

```bash
npm run migrate:dev
npm run build
npm run start
```

Expect:
- migrations apply without SQL errors
- server starts on configured `PORT`

## 2) Register user (trial license auto-issue)

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"qa@example.com\",\"password\":\"StrongPass123!\"}"
```

Expect:
- `user_id`
- `trial_license_key` (when `free_trial` plan exists)

## 3) Login and capture token

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"qa@example.com\",\"password\":\"StrongPass123!\"}"
```

Expect:
- `access_token`
- `refresh_token`

## 4) Activation

```bash
curl -X POST http://localhost:5000/licenses/activate \
  -H "Content-Type: application/json" \
  -d "{\"license_key\":\"<TRIAL_OR_PAID_KEY>\",\"device_id\":\"qa-device-001\",\"device_name\":\"QA Desktop\"}"
```

Expect:
- `activation_id`
- `license_id`

## 5) Chat with activation and model

```bash
curl -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -H "x-activation-id: <ACTIVATION_ID>" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Hello IRA\"}],\"model\":\"openai/gpt-4o-mini\"}"
```

Expect:
- `reply`
- usage is tracked (when provider returns usage info)

## 6) Verify profile/entitlements/usage

```bash
curl http://localhost:5000/me/profile -H "Authorization: Bearer <ACCESS_TOKEN>"
curl http://localhost:5000/me/entitlements -H "Authorization: Bearer <ACCESS_TOKEN>"
curl http://localhost:5000/me/usage -H "Authorization: Bearer <ACCESS_TOKEN>"
curl http://localhost:5000/me/overview -H "Authorization: Bearer <ACCESS_TOKEN>"
```

Expect:
- profile populated
- plan + model entitlements present
- usage increments after chat calls

## 7) Desktop settings verification

- Open settings window from topbar settings icon.
- Login/register from settings.
- Confirm account, plan, usage, licenses render.
- Activate a key in settings and confirm activation id/device id appear.
- Click settings icon again and confirm settings window closes.
- Send chats and open response history; confirm messages are persisted from local SQLite context.

