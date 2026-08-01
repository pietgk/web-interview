# ADR 001: Error handling across domain, HTTP, and frontend boundaries

- Status: Accepted
- Date: 2026-07-31
- Decision owners: Web interview implementation team
- Scope: Todo contract, backend store and routes, frontend API client, and tests

## Context

The application handles errors in three different layers:

1. The store detects domain failures such as a missing todo list or invalid todos.
2. Express translates failures into HTTP responses.
3. The frontend translates unsuccessful HTTP responses into JavaScript errors used by the UI.

These layers need related but different information. Mixing them creates ambiguous results such as
an internal `result.code` with one value and `result.body.code` with another. It also makes the
store responsible for HTTP response bodies and allows unknown internal failures to leak into the
public API.

HTTP status codes and application error codes solve different problems:

- The HTTP status communicates the broad protocol outcome, such as bad request or not found.
- The application code identifies a stable, machine-readable failure within that category.
- The error message explains the failure to a human.
- Validation issues identify fields that did not satisfy the contract.

There is no universal JSON error body mandated by HTTP. This ADR defines one small, consistent
contract for this application.

## Decision

### 1. Use HTTP status only at the HTTP boundary

Backend routes and middleware use named Node HTTP constants:

```js
import { constants as HTTP } from 'node:http2'

HTTP.HTTP_STATUS_OK
HTTP.HTTP_STATUS_BAD_REQUEST
HTTP.HTTP_STATUS_NOT_FOUND
HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR
```

Raw HTTP responses are inspected through `response.status` or the equivalent server-library
property. We do not use `response.code` for an HTTP status.

Examples:

```js
response.status
response.body.code
```

`response.status` is the protocol status. `response.body.code` is the application error code.

Successful responses return the requested resource and do not include an application error code.
Express may use its default success status where that is unambiguous. Explicit named constants are
preferred when the status is part of the behavior being selected or tested.

### 2. Define public API error codes once

Public error codes are exported by the shared contract package:

```js
export const API_ERROR_CODE = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TODO_LIST_NOT_FOUND: 'TODO_LIST_NOT_FOUND',
  MALFORMED_JSON: 'MALFORMED_JSON',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})
```

The object is frozen because it is shared by every importer. Freezing prevents accidental runtime
addition, deletion, or replacement of a contract value. It is shallow, which is sufficient because
all values are strings.

Public codes are stable identifiers. They may be used by clients, tests, logs, and documentation.
Changing a code is an API contract change. Human-readable messages may improve without changing
the code.

Public codes are semantic names. We do not use numeric HTTP values such as `404` as application
codes.

### 3. Use one flat JSON error body

Every JSON error response has these required fields:

```json
{
  "error": "Todo list not found",
  "code": "TODO_LIST_NOT_FOUND"
}
```

The fields mean:

- `error`: concise human-readable message suitable for display or logs
- `code`: stable machine-readable value from `API_ERROR_CODE`

Validation errors may also include `issues`:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "issues": [
    {
      "path": ["todos", 0, "dueDate"],
      "message": "dueDate must be a real calendar date"
    }
  ]
}
```

`issues` is optional for non-validation errors. When present, it is an array. We do not include
stack traces, exception names, raw Zod objects, database details, or unknown internal codes in a
public response.

The API currently uses `application/json`. Adopting RFC Problem Details and
`application/problem+json` would be a separate decision. The flat contract above is sufficient for
this application and avoids adding structure that has no current consumer.

### 4. Keep store failures independent of HTTP

The store returns domain results. It does not return HTTP statuses or HTTP response bodies.

Example:

```js
export const STORE_ERROR = Object.freeze({
  TODO_LIST_NOT_FOUND: 'TODO_LIST_NOT_FOUND',
  INVALID_TODOS: 'INVALID_TODOS',
})

return {
  ok: false,
  code: STORE_ERROR.INVALID_TODOS,
  issues,
}
```

Store result fields mean:

- `ok`: discriminates success from failure
- `code`: internal domain code from `STORE_ERROR`
- `issues`: optional structured domain or validation details

The store must not return a field named `body`. A body is an HTTP transport concept.

Internal store codes and public API codes may intentionally differ. For example:

```text
STORE_ERROR.INVALID_TODOS
    -> HTTP 400 Bad Request
    -> API_ERROR_CODE.VALIDATION_ERROR
```

The distinction is explicit and is resolved in one place: the route mapping.

### 5. Routes own domain-to-HTTP translation

Routes validate incoming HTTP data and translate domain failures into the public contract.

The mapping must provide all three values needed at the boundary:

```js
const STORE_ERROR_RESPONSE = Object.freeze({
  [STORE_ERROR.TODO_LIST_NOT_FOUND]: {
    status: HTTP.HTTP_STATUS_NOT_FOUND,
    code: API_ERROR_CODE.TODO_LIST_NOT_FOUND,
    error: 'Todo list not found',
  },
  [STORE_ERROR.INVALID_TODOS]: {
    status: HTTP.HTTP_STATUS_BAD_REQUEST,
    code: API_ERROR_CODE.VALIDATION_ERROR,
    error: 'Validation failed',
  },
})
```

Known failures use the mapped status, public code, message, and optional issues.

Unknown or incomplete store failures are never returned using `result.code`. They become a generic
internal error:

```js
res.status(HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
  error: 'Internal server error',
  code: API_ERROR_CODE.INTERNAL_ERROR,
})
```

The original error is logged on the server with appropriate operational context. Its internal
message and stack are not sent to the client.

### 6. Use consistent status and code combinations

The API uses the following combinations:

| Situation | HTTP status | Public code |
| --- | ---: | --- |
| Request JSON cannot be parsed | `HTTP_STATUS_BAD_REQUEST` | `MALFORMED_JSON` |
| Request does not satisfy the schema | `HTTP_STATUS_BAD_REQUEST` | `VALIDATION_ERROR` |
| Todo list does not exist | `HTTP_STATUS_NOT_FOUND` | `TODO_LIST_NOT_FOUND` |
| Unexpected server failure | `HTTP_STATUS_INTERNAL_SERVER_ERROR` | `INTERNAL_ERROR` |

For this API, structural and field-validation failures both use HTTP 400. We do not split them
between HTTP 400 and 422. That distinction would not currently improve client behavior and would
create an unnecessary policy boundary.

### 7. Convert unsuccessful HTTP responses into `ApiError`

The frontend API module converts non-successful responses into a dedicated error type:

```js
export class ApiError extends Error {
  constructor({ message, status, code, issues = [], cause }) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues
  }
}
```

Frontend consumers use:

```js
error.message
error.status
error.code
error.issues
```

They do not need to know the raw response-body shape or reach through `error.body.code`.

For a valid JSON API error response:

```text
error.status  <- response.status
error.code    <- response body code
error.message <- response body error
error.issues  <- response body issues or []
```

If a non-successful response is missing the documented JSON error body, the client creates an
`ApiError` with a generic message and a client-side fallback code. It must not guess a more specific
public API code.

Transport failures happen before an HTTP response exists. They therefore have no HTTP status and
must not be represented as HTTP 500. An aborted request is control flow and should normally be
ignored by the UI. Other network failures may be wrapped with a client-only `NETWORK_ERROR` code
and `status: null` if the UI needs to distinguish them.

An invalid successful response is a client-observed contract failure, not an HTTP error generated
by the server. It may use a client-only `INVALID_RESPONSE` code while preserving the received HTTP
status for diagnostics.

Client-only codes are not added to `API_ERROR_CODE`, because the server never emits them.

### 8. Keep validation errors stable at the shared boundary

Zod validates request and response data, but raw Zod errors are not part of the public contract.
The shared contract converts them to the stable issue shape:

```js
{
  path: issue.path,
  message: issue.message,
}
```

The shared package may construct validation details, but the route remains responsible for adding
the HTTP status and sending the response. Store results may reuse the formatted issues without
constructing an HTTP body.

### 9. Test each layer at its own boundary

Store tests assert domain behavior:

```js
assert.equal(result.ok, false)
assert.equal(result.code, STORE_ERROR.INVALID_TODOS)
assert.ok(Array.isArray(result.issues))
assert.equal('body' in result, false)
```

HTTP integration tests assert the public contract:

```js
assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
assert.equal(response.body.code, API_ERROR_CODE.VALIDATION_ERROR)
assert.equal(response.body.error, 'Validation failed')
assert.ok(Array.isArray(response.body.issues))
```

Frontend API tests assert the thrown error contract:

```js
await expect(request).rejects.toMatchObject({
  name: 'ApiError',
  status: HTTP.HTTP_STATUS_BAD_REQUEST,
  code: API_ERROR_CODE.VALIDATION_ERROR,
  message: 'Validation failed',
})
```

Tests must also cover:

- malformed JSON
- missing resources
- invalid request data
- unknown store failures
- unexpected middleware failures
- non-JSON unsuccessful responses
- network failures
- aborted requests
- invalid successful responses

Tests use named constants instead of duplicating protocol numbers or public error-code strings.
Behavioral assertions are preferred over broad snapshots.

## Implementation consequences

### Positive

- HTTP, domain, and frontend error responsibilities are explicit.
- Every public error has a stable machine-readable code and a human-readable message.
- The store can be tested and reused without Express concepts.
- Unknown internal failures cannot accidentally expose internal details.
- Frontend components consume one stable `ApiError` interface.
- Tests describe the contract using the same named constants as the implementation.

### Negative

- Domain codes and public API codes require an explicit mapping.
- A small custom `ApiError` type must be maintained.
- Adding a new public failure requires updating the shared constants, route mapping, and contract
  tests.

These costs are deliberate. They make changes visible at compile, lint, or test time instead of
allowing accidental contract drift.

## Alternatives considered

### Return HTTP statuses and bodies directly from the store

Rejected because it couples domain behavior to Express and creates ambiguous combinations such as
`result.code` and `result.body.code` with different meanings.

### Use only HTTP statuses

Rejected because one HTTP status can represent multiple failures. Clients would need to inspect
human-readable messages, which are not a stable machine contract.

### Put numeric HTTP values in `body.code`

Rejected because it duplicates `response.status` and loses application-specific meaning.

### Use `response.code` for HTTP status

Rejected because raw Fetch responses expose `status`, and `code` is commonly used by runtime and
network errors for values such as `ECONNRESET`.

### Adopt RFC Problem Details immediately

Deferred. It is a valid standard for larger HTTP APIs, but the current application has no consumer
that benefits from its additional fields. A future ADR may replace this contract if interoperability
requirements justify it.

## Migration from the current implementation

The implementation already follows parts of this ADR:

- Named Node HTTP status constants are used.
- Public responses use `response.status` and `response.body.code`.
- Validation errors have a stable issue array.
- Malformed JSON and unexpected middleware errors return JSON.

The remaining migration work is:

1. Export `API_ERROR_CODE` from the shared contract and replace duplicated string literals.
2. Remove HTTP-shaped `body` values from store failures.
3. Map every store error to status, public code, and message in the route.
4. Guarantee `INTERNAL_ERROR` for unknown store and middleware failures.
5. Introduce `ApiError` and expose `status`, `code`, and `issues` directly to frontend consumers.
6. Add the layer-specific tests defined above.

This migration changes error representation, not successful resource responses.

