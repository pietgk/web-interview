# ADR 001: Error handling across domain, HTTP, and frontend boundaries

- Status: Superseded by [ADR 008](./008-structured-datom-delivery-failures.md)
- Date: 2026-07-31
- Scope: Todo contract, backend store and routes, frontend API client, and tests

Superseded. Full text: [`./archive/001-error-handling.md`](./archive/001-error-handling.md).

ADR 001 described a request-oriented `ApiError` interface. The event-driven datom client made
that interface a dead end; [ADR 008](./008-structured-datom-delivery-failures.md) records the
structured delivery-failure model that replaced it.
