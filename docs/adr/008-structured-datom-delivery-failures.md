# ADR 008: Structured failures for datom delivery

- Status: Accepted
- Date: 2026-08-08
- Scope: Datom HTTP errors, browser delivery failures, optimistic state, and StatusBar recovery
- Supersedes: [ADR 001](./001-error-handling.md)

## Decision

The frontend has one event-driven `todoClient` (outbox + delivery status), not a request-oriented
API that throws `ApiError`. ADR 001's thrown-error interface therefore had no natural caller.

The server exposes one validated error response shape with a stable server-only `API_ERROR_CODE`
vocabulary. The browser converts unsuccessful responses into structured failure values (status,
code, message, issues). Network and invalid-response failures use a separate browser-only
vocabulary. Unexpected server failures stay at the HTTP seam as generic `INTERNAL_ERROR` without
leaking internals.

A network failure leaves the outbox intact for retry. A permanent API rejection removes the
rejected batch, resynchronizes from authoritative state, and publishes **Changes not saved** until
a later write succeeds. Rejected optimistic state must never remain visible as though persisted.
StatusBar details expose message, code, HTTP status (or **No response**), and stable issue paths
without making protocol text the primary UI.

## See also

- [`docs/architecture.md`](../architecture.md) — StatusBar as projection; client/outbox behavior
- [ADR 001 tombstone](./001-error-handling.md) / [archive](./archive/001-error-handling.md)
- [ADR 004](./004-single-datom-log.md) — single-datom model
- [`docs/adr/README.md`](./README.md)
