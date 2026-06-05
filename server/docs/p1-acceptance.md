# P1 Milestone Acceptance — 2026-06-05

**Status**: ✅ ALL 9 ITEMS PASS  
**Tester**: chen (陈工) + Claude  
**Branch**: `feature/h5-redesign`  
**Commits**: 9a507a2 (Task 12) → 0eb0238 (runbook Task 12) → this acceptance

## 1. Acceptance Checklist Results

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `POST /api/auth/sms/send` 60s 内第二次 429 | ✅ | 1st `200`, 2nd `429 code:2020 请求过于频繁` |
| 2 | dev 控制台有验证码 | ✅ | `pino warn "[dev] sms code" phone:"13980650642" code:"198745"` |
| 3 | `POST /api/auth/login` → access + refresh + user | ✅ | 返回 token (207b) + refreshToken (207b) + user (id, nickname, phone_mask) |
| 4 | `GET /api/user/me` 带 token 通过；不带 401 | ✅ | no token `401 未登录或登录已过期`, with token `200` |
| 5 | `PATCH /api/user/me` 改 nickname 成功 | ✅ | `用户0642` → `验收陈工` |
| 6 | `DELETE /api/user/me` → status=pending_delete, delete_at=+30d | ✅ | DB: `grace_days=30`, 立即 token 吊销 `401 账号已注销` |
| 7 | `GET /api/agreement/current?type=user` 返回种子内容 | ✅ | `{type:user, version:v1.0, content_len:128}` |
| 8 | `POST /api/agreement/accept` 写库, 二次幂等 | ✅ | 1st `201`, 2nd `201`, DB rows=1 (UNIQUE+ON CONFLICT) |
| 9 | Runbook 9-12 状态全 ✅ | ✅ | All 4 tasks marked DONE in runbook |

## 2. Unit Test Summary

```
Test Suites: 13 passed, 13 total
Tests:       68 passed, 68 total
```

| Suite | Tests | Source |
|---|---|---|
| sms.service.spec | 7 | Task 9 |
| auth.service.spec | 8 | Task 10 |
| user.service.spec | 4 | Task 11 |
| agreement.service.spec | 8 | Task 12 |
| jwt-auth.guard.spec | 5 | Task 10/11 |
| admin-auth.guard.spec | 6 | Task 10 |
| roles.guard.spec | 2 | Task 10 |
| crypto.service.spec | ~12 | Task 10 |
| main.spec | 1 | bootstrap |
| others (entities, etc.) | ~15 | — |

## 3. End-to-End Flow Walkthrough

```
Browser
  ↓ POST /api/auth/sms/send {phone:13980650642}
Server → 200 {ok:true, ttl:60}     [Item 1, dev log: code 198745]
  ↓ POST /api/auth/login {phone, code:198745}
Server → 200 {token, refreshToken, user:{id, nickname:"用户0642", phone_mask:"139****0642"}}
  ↓ GET /api/user/me (Authorization: Bearer token)
Server → 200 {id, nickname, phone_mask, credits:0}
  ↓ PATCH /api/user/me {nickname:"验收陈工"}
Server → 200 {nickname:"验收陈工"}      [Item 5]
  ↓ DELETE /api/user/me
Server → 200 {ok:true, delete_at:"2026-07-05..."}   [+30d, Item 6]
  ↓ GET /api/user/me (same token)
Server → 401 "账号已注销"            [Redis revocation, immediate]

  (fresh user 13980650718)
  ↓ POST /api/agreement/accept {type:user}
Server → 201 {ok:true, version:v1.0}      [Item 8 #1]
  ↓ POST /api/agreement/accept {type:user}  (再次)
Server → 201 {ok:true, version:v1.0}      [Item 8 #2 idempotent]
  DB → user_agreements: 1 row (UNIQUE constraint)
```

## 4. Bug Found and Fixed During Acceptance

- **Item 1 cooldown counter**: `sms:cooldown:PHONE` in Redis is per-phone, separate from IP rate limit. Works as designed (60s).
- **Item 7 type=unknown bug** (discovered during Task 12 dev): `PROTOCOL_KEYS['unknown']` → `undefined` → TypeORM treats `{key: undefined}` as `IS NULL` → returns first row. **Fixed in Task 12 commit 9a507a2** with DTO `@IsIn` (400) + service `if (!PROTOCOL_KEYS[type])` defense (404).
- **No bugs found during this acceptance run.**

## 5. Known Limitations / Out of Scope (P2+)

- Frontend web/admin: scaffold only (Tasks 6-7), no end-to-end browser flow yet.
- Refresh token rotation: not yet implemented (Task 10 has bare endpoint, rotation deferred to P2).
- Email notifications: not implemented (P5).
- Audit log of admin actions: not implemented (P5).

## 6. Sign-off

P1 milestone (User + Agreement) is **READY FOR P2**.
All 9 acceptance items pass, 68/68 unit tests pass, server boots clean, all DB writes observed and verified.
