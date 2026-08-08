# ADR 008: Structured failures for datom delivery

- Status: Accepted
- Date: 2026-08-08
- Scope: Datom HTTP errors, browser delivery failures, optimistic state, and StatusBar recovery
- Supersedes: [ADR 001](./001-error-handling.md)

ADR 001 expects a request-oriented frontend API to throw `ApiError`. The current frontend instead
has one event-driven `todoClient`: commands optimistically append datoms to an outbox, and the
client publishes delivery status to people and browser-operating agents. Adding a thrown error
type would create an interface with no natural caller.

The server exposes one validated error response shape with a stable server-only
`API_ERROR_CODE` vocabulary. The browser converts unsuccessful responses into structured
failure values containing status, code, message, and issues. Network and invalid-response failures
use a separate browser-only vocabulary, because the server never emits them. Direct API
clients, including agents, can branch on the public code without parsing human-readable text.
Unexpected server and middleware failures remain contained at the HTTP seam: the server logs the
original failure and returns only a generic HTTP 500 `INTERNAL_ERROR` response, without exposing
the internal message, stack, or implementation details.

A network failure leaves the outbox intact for retry. A permanent API rejection removes the
rejected batch, resynchronizes from authoritative server state, and publishes **Changes not
saved**. Rejected optimistic state must never remain visible as though it were persisted. The
failure stays visible until a later write succeeds; neither resynchronization nor a timeout clears
it. StatusBar details expose the message, code, HTTP status (or **No response**), and stable issue
paths and messages without making protocol text the primary UI.

The implementation and its boundary tests are green, so this decision supersedes ADR 001's
request-oriented `ApiError` interface.
