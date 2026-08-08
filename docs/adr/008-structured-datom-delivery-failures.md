# ADR 008: Structured failures for datom delivery

- Status: Proposed
- Date: 2026-08-08
- Scope: Datom HTTP errors, browser delivery failures, optimistic state, and StatusBar recovery
- Proposed successor to: [ADR 001](./001-error-handling.md)

ADR 001 expects a request-oriented frontend API to throw `ApiError`. The current frontend instead
has one event-driven `todoClient`: commands optimistically append datoms to an outbox, and the
client publishes delivery status to people and browser-operating agents. Adding a thrown error
type would create an interface with no natural caller.

The server will expose one validated error response shape with a stable server-only
`API_ERROR_CODE` vocabulary. The browser will convert unsuccessful responses into structured
failure values containing status, code, message, and issues. Network and invalid-response failures
will use a separate browser-only vocabulary, because the server never emits them. Direct API
clients, including agents, can branch on the public code without parsing human-readable text.

A network failure leaves the outbox intact for retry. A permanent API rejection removes the
rejected batch, resynchronizes from authoritative server state, and publishes **Changes not
saved**. Rejected optimistic state must never remain visible as though it were persisted. The
failure stays visible until a later write succeeds; neither resynchronization nor a timeout clears
it. Details expose the structured server reason without making protocol text the primary UI.

This ADR becomes Accepted, and ADR 001 becomes Superseded, only when the implementation and its
boundary tests are green. Until then ADR 001 remains the accepted description and this document
records the agreed migration target without claiming the repository already conforms to it.
