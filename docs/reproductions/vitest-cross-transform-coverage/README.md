# Vitest cross-transform coverage reproduction

This self-contained fixture reproduces two executable-map differences when the same source and
package versions run under Vitest Node SSR coverage and Vitest browser coverage.

## Run

Use Node 22, then run:

```bash
npm install
npx playwright install chromium
npm run reproduce
```

The final command asserts the stable imported-call locations and the structural browser-only
React statement, then prints:

```text
Reproduced imported-call column shift and browser-only React import statement.
```

## Exact versions

- Node 22
- Vitest 4.1.10
- `@vitest/coverage-v8` 4.1.10
- `ast-v8-to-istanbul` 1.0.5, pinned transitively by `package-lock.json`
- Vite 6.4.3
- `@vitest/browser-playwright` 4.1.10
- Playwright 1.62.1
- React 18.3.1

Both paths use Vitest's V8 coverage provider. Only the Vite transform environment differs.

## Imported-call mismatch

Original source:

```js
import { importedFunction } from './dependency.js'

export const value = importedFunction()
```

The SSR transform wraps the imported call to preserve direct-call semantics:

```js
const value = (0,__vite_ssr_import_0__.importedFunction)()
```

Its relevant source-map mapping is:

```text
AAEO,KAAK,CAAC,KAAK,CAAC,CAAC,IAAC,uCAAgB,CAAC
```

The browser transform leaves the direct call intact and returns no source map for this unchanged
module. The resulting Istanbul statement maps differ only at the start column:

```json
Node:    {"0":{"start":{"line":3,"column":20},"end":{"line":3,"column":null}}}
Browser: {"0":{"start":{"line":3,"column":21},"end":{"line":3,"column":null}}}
```

The hit counter ID is the same, but merging by counter ID is not a general proof of executable
identity because transforms can also insert counters.

## Named React import mismatch

Original source:

```js
import { useState } from 'react'

export const importedHook = useState
```

The browser transform introduces a CommonJS interop binding:

```js
import __vite__cjsImport0_react from "/.../react.js"
const useState = __vite__cjsImport0_react["useState"]
```

Vitest counts that generated binding as a statement mapped to the original import line. The Node
SSR map has one statement, while the browser map has an additional statement. This checkout
produced:

```json
Node:    {"0":{"start":{"line":3,"column":28},"end":{"line":3,"column":null}}}
Browser: {"0":{"start":{"line":1,"column":150},"end":{"line":1,"column":null}},"1":{"start":{"line":3,"column":28},"end":{"line":3,"column":null}}}
```

The generated binding's exact column can reflect the transformed import URL length, so the
executable assertion requires the stable fact that it is an extra statement on line 1 and that
the original line-3 statement remains unchanged.

This structural case is why subtracting one column or merging by counter ID would be unsafe.
