# Backend Code Review — TODO

> Generated from full static analysis of the Go backend.  
> 51 issues across 4 severity levels.

---

## Critical (8)

- [ ] **C1 — CORS wildcard + `Allow-Credentials: true`**  
  `middleware/middleware.go`  
  `Access-Control-Allow-Origin: *` combined with `Access-Control-Allow-Credentials: true` is rejected by browsers and is a CSRF vector.  
  **Fix:** Reflect the specific request origin (or a configured allowlist) instead of `*`.

- [ ] **C2 — `JWT_SECRET` defaults to empty string**  
  `config/config.go:136`  
  If `JWT_SECRET` is missing from the environment, every JWT is signed with `""` — any token becomes trivially forgeable.  
  **Fix:** Fatal at startup if `JWT_SECRET` is empty.

- [ ] **C3 — WebSocket allows all origins**  
  `ws/hub.go:28`  
  The upgrader's `CheckOrigin` always returns `true` — any website can open a WebSocket to the API and hijack the authenticated session.  
  **Fix:** Validate `r.Header.Get("Origin")` against `cfg.Domain`.

- [ ] **C4 — Invite delete has no authorization check**  
  `api/invites.go`  
  `DELETE /api/invites/{id}` verifies authentication but never checks whether the caller owns the invite or has admin permissions in the community.  
  **Fix:** Verify the caller is the invite creator or holds `ManageInvites` permission.

- [ ] **C5 — SSRF via embed URL fetching**  
  `api/embeds.go`  
  User-supplied URLs are fetched server-side with no network restriction — attackers can probe internal services (`minio:9000`, `postgres:5432`, Redis, etc.).  
  **Fix:** Resolve the URL to an IP before fetching; reject private/loopback/link-local ranges.

- [ ] **C6 — Hub broadcast closes `client.send` under read lock (race + panic)**  
  `ws/hub.go`  
  The broadcast loop closes `client.send` while holding only a read lock; concurrent `SendToUser` goroutines may write to the same channel simultaneously → panic on send-to-closed-channel.  
  **Fix:** Route client removal through the unregister channel so only the `Run()` goroutine closes `client.send`.

- [ ] **C7 — `SendToUser` goroutines write to `client.send` after `Run()` closes it**  
  `ws/hub.go`  
  `SendToUser` spawns a goroutine that writes to `client.send`; if the client disconnects and `Run()` closes the channel between the nil-check and the send, the goroutine panics.  
  **Fix:** Use a `select` with a `default` or `done` channel; never send to a channel whose lifecycle you don't own.

- [ ] **C8 — Invite use count incremented before membership check**  
  `api/communities.go`  
  `IncrementUseCount` is called before `AddMember` succeeds — an attacker can drain `max_uses` on any invite without actually joining.  
  **Fix:** Increment use count only after `AddMember` succeeds, inside the same transaction.

---

## High (10)

- [ ] **H1 — PostgreSQL DSN hardcodes `sslmode=disable`**  
  `config/config.go:50`  
  All DB connections are unencrypted — critical in any non-localhost deployment.  
  **Fix:** Add `POSTGRES_SSLMODE` env var, default to `require`.

- [ ] **H2 — MIME type validation trusts client `Content-Type`**  
  `api/uploads.go`  
  File type is validated from the multipart part header — fully attacker-controlled.  
  **Fix:** Use `http.DetectContentType` on the first 512 bytes of the actual file body.

- [ ] **H3 — SVG uploads allowed → stored XSS**  
  `storage/storage.go` / `api/uploads.go`  
  `image/svg+xml` is in the allowlist; SVG files can contain arbitrary `<script>` tags executed by browsers when served directly.  
  **Fix:** Remove SVG from the allowlist, or serve all uploads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

- [ ] **H4 — Rate limiter `rps` field set but never used**  
  `middleware/middleware.go`  
  The token bucket uses only `burst`; the actual rate is 2× the configured `RATE_LIMIT_RPS`.  
  **Fix:** Use `rps` to set the refill rate in the token bucket logic.

- [ ] **H5 — Rate limiter IP spoofable via `X-Real-IP`**  
  `middleware/middleware.go`  
  Client IP is read from `X-Real-IP` with no validation — anyone can bypass rate limiting by spoofing this header.  
  **Fix:** Only trust `X-Real-IP`/`X-Forwarded-For` when the request originates from a known trusted proxy subnet; otherwise use `r.RemoteAddr`.

- [ ] **H6 — LiveKit TURN secret has no startup validation**  
  `cmd/server/main.go` / `config/config.go`  
  `LIVEKIT_TURN_SECRET` defaults to `""` — the ICE handler issues credentials signed with an empty secret that any client can replicate.  
  **Fix:** Fatal at startup if `LIVEKIT_TURN_SECRET` is empty.

- [ ] **H7 — `handleDisconnect` in `voice.go` is dead code**  
  `api/voice.go:289`  
  The method is never called — LiveKit disconnect webhooks are not wired up, so voice state is never cleaned up on unexpected disconnects.  
  **Fix:** Wire a LiveKit webhook endpoint that calls this, or remove the method and document the gap.

- [ ] **H8 — N+1 query in `ListDMChannels`**  
  `db/dm.go`  
  A separate `SELECT` is issued per DM channel to fetch members — O(N) round trips.  
  **Fix:** Batch with a single `JOIN` or `WHERE channel_id = ANY($1)` query.

- [ ] **H9 — `voice_states` PK/unique index mismatch**  
  `migrations/002_voice_states.up.sql`  
  `user_id UUID PRIMARY KEY` already enforces uniqueness; the additional `UNIQUE(user_id, channel_id)` index is redundant and misleading.  
  **Fix:** Drop the redundant unique constraint.

- [ ] **H10 — `WriteTimeout: 15s` kills WebSocket connections and large uploads**  
  `cmd/server/main.go:250`  
  The global HTTP `WriteTimeout` drops WebSocket connections after 15 s of inactivity and cuts off large file uploads.  
  **Fix:** Use `http.TimeoutHandler` only on REST routes; exempt `/ws` and upload endpoints from the global write timeout, or use a separate listener.

---

## Medium (9)

- [ ] **M1 — Integer overflow in `parsePositiveInt`**  
  `api/helpers.go`  
  `strconv.Atoi` returns a platform-width `int`; on 32-bit systems `limit=3000000000` overflows to a negative number and bypasses the `<= 0` guard.  
  **Fix:** Use `strconv.ParseInt` with explicit bit size 32, or clamp after parsing.

- [ ] **M2 — Pagination cursor on `created_at` skips tied messages**  
  `db/messages.go`  
  `WHERE created_at < $before ORDER BY created_at DESC` skips messages when two share the same timestamp.  
  **Fix:** Use a composite cursor `(created_at, id)` or keyset pagination on `id`.

- [ ] **M3 — `DisallowUnknownFields` breaks PATCH partial updates**  
  `api/helpers.go` / `readJSON`  
  Applied globally — PATCH requests that include any field not in the target struct are rejected, which is wrong for partial-update semantics.  
  **Fix:** Only apply `DisallowUnknownFields` on POST/PUT; allow unknown fields on PATCH.

- [ ] **M4 — `LogLevel` config field never applied**  
  `config/config.go:115`  
  `API_LOG_LEVEL` is read into config but never used to change log verbosity.  
  **Fix:** Wire it to `slog` or gate debug-level logs behind the flag.

- [ ] **M5 — `MaxUploadSize` enforced inconsistently**  
  `config/config.go:141` / `api/uploads.go`  
  Config value and the hardcoded `32 << 20` in `r.ParseMultipartForm` can diverge silently.  
  **Fix:** Use `http.MaxBytesReader(w, r.Body, cfg.MaxUploadSize)` before parsing; remove the hardcoded constant.

- [ ] **M6 — Unsynchronized map read in `HandleVoiceJoin`**  
  `signaling/voice_ws.go`  
  `roomManager.GetParticipants` is called without a lock after `JoinRoom` — a concurrent leave can cause a map read/write race.  
  **Fix:** Ensure `GetParticipants` acquires the read lock internally.

- [ ] **M7 — Silent error swallowing in voice leave cleanup**  
  `signaling/voice_ws.go` / `db/voice_states.go`  
  DB errors during `Leave` are logged but the function returns success — the client gets `200 OK` with ghost participants remaining in the DB.  
  **Fix:** Return the DB error or clearly distinguish "in-memory left, DB failed" from "fully left".

- [ ] **M8 — Default role update ignores `name` and `color`**  
  `api/roles.go`  
  `PATCH /api/roles/{id}` on a default role silently discards `name` and `color` changes because the query only updates `permissions`.  
  **Fix:** Use the same UPDATE path for all roles regardless of `is_default`.

- [ ] **M9 — Private community info leaked to non-members**  
  `api/communities.go`  
  `GET /api/communities/{id}` returns full details (description, member count, channels) for private communities without checking membership.  
  **Fix:** Verify `IsMember` before returning full details for private communities; return 403 or a redacted response otherwise.

---

## Low (18)

- [ ] **L1 — `writeJSON` duplicated across packages**  
  Multiple `api/*.go` files — centralise in `helpers.go`.

- [ ] **L2 — `LiveKitURL` config field loaded but never used**  
  `config/config.go:146`  
  `cfg.LiveKitURL` is read from env but never passed to any function. Remove the field or wire the LiveKit `RoomServiceClient`.

- [ ] **L3 — Dead query methods never called**  
  `db/notifications.go`, `db/users.go`  
  `RevokeAllUserTokens` and `CleanOld` are defined but never invoked. Add a comment or remove them.

- [ ] **L4 — `getEnv` ignores explicitly empty env vars**  
  `config/config.go:151`  
  `if v := os.Getenv(key); v != ""` — setting `JWT_SECRET=` (empty) silently falls back to the default, making the C2 guard bypassable.  
  **Fix:** Use `os.LookupEnv` to distinguish "not set" from "set to empty string".

- [ ] **L5 — `COALESCE` in UPDATE prevents clearing optional profile fields**  
  `db/users.go`  
  `SET display_name = COALESCE($1, display_name)` means users can never clear their display name or bio.  
  **Fix:** Use an explicit `NULL` sentinel value or add a separate clear endpoint.

- [ ] **L6 — `AddMember` is not atomic**  
  `db/communities.go`  
  `IsMember` check + `INSERT INTO community_members` are two separate queries — concurrent joins can insert duplicate rows.  
  **Fix:** Use `INSERT ... ON CONFLICT DO NOTHING` and check the affected row count.

- [ ] **L7 — Expired invites returned by `GetByCode`**  
  `db/invites.go`  
  `GetByCode` does not filter on `expires_at > NOW()` — expired codes still resolve.  
  **Fix:** Add `AND (expires_at IS NULL OR expires_at > NOW())` to the query.

- [ ] **L8 — Unnecessary `parseUUID` wrapper**  
  `api/helpers.go`  
  Wraps `uuid.Parse` with no added value. Replace call sites with `uuid.Parse` directly.

- [ ] **L9 — Embed goroutine uses cancelled request context**  
  `api/embeds.go`  
  The HTTP fetch for link previews captures `r.Context()` in a goroutine — when the handler returns the context is cancelled, aborting the fetch prematurely.  
  **Fix:** Use `context.WithoutCancel(r.Context())` or a background context with a dedicated timeout.

- [ ] **L10 — `CreateDMChannel` check-then-create race**  
  `db/dm.go`  
  `GetDMChannel` + `CreateDMChannel` are two separate queries — concurrent requests from the same two users can create duplicate DM channels.  
  **Fix:** Use `INSERT ... ON CONFLICT DO NOTHING RETURNING id` or a serializable transaction.

- [ ] **L11 — Storage returns relative URL**  
  `storage/storage.go:76`  
  `/storage/<bucket>/<object>` is relative to the proxy — if the nginx path prefix changes, all stored URLs break silently.  
  **Fix:** Store the full public URL or make the path prefix configurable.

- [ ] **L12 — `voice_states.Leave` missing `pgx.ErrNoRows` handling**  
  `db/voice_states.go`  
  Returns a generic error when the user is not in any voice room, causing spurious error logs at the call site.  
  **Fix:** Check `errors.Is(err, pgx.ErrNoRows)` and return a typed `ErrNotInVoice`.

- [ ] **L13 — `SetVoiceHandler` on hub is not synchronized**  
  `ws/hub.go`  
  Called from `main.go` before `hub.Run()` starts — safe today but has no memory barrier. If call order changes it becomes a data race.  
  **Fix:** Set it in the `NewHub` constructor instead of as a post-construction setter.

- [ ] **L14 — Typing events have no membership check**  
  `ws/hub.go`  
  `typing_start` events are forwarded without verifying the sender is a member of the channel — any authenticated user can spam typing indicators into any channel.  
  **Fix:** Verify channel membership before broadcasting typing events.

- [ ] **L15 — `MarkRead` returns 500 instead of 404 for unknown notification**  
  `api/notifications.go`  
  `pgx.ErrNoRows` falls through to the generic 500 handler.  
  **Fix:** Check `errors.Is(err, pgx.ErrNoRows)` and return 404.

- [ ] **L16 — Fragile rollback error string comparison in migrations**  
  `db/db.go`  
  Rollback failure detected by matching `err.Error()` against a hardcoded string — brittle against pgx version changes.  
  **Fix:** Use `errors.Is(err, pgx.ErrTxClosed)` instead.

- [ ] **L17 — Missing trigram index on `communities.name`**  
  `migrations/001_initial_schema.up.sql`  
  Community search uses `ILIKE '%query%'` — a sequential scan on every search.  
  **Fix:** `CREATE EXTENSION IF NOT EXISTS pg_trgm` and `CREATE INDEX ON communities USING GIN (name gin_trgm_ops)`.

- [ ] **L18 — DM messages lack a full-text search vector**  
  `migrations/001_initial_schema.up.sql`  
  `messages` has a `search_vector` column and trigger; `dm_messages` does not — DM content is unsearchable.  
  **Fix:** Add `search_vector tsvector`, an update trigger, and a GIN index to `dm_messages`.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 8     | 0 / 8 done |
| High     | 10    | 0 / 10 done |
| Medium   | 9     | 0 / 9 done |
| Low      | 18    | 0 / 18 done |
| **Total**| **51**| **0 / 51 done** |
