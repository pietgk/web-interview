/**
 * @param {string} name
 * @param {number} fallback
 */
const environmentPort = (name, fallback) => {
  const port = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`)
  }
  return port
}

/** Verify / headless Playwright lane (defaults; overridable via env). */
export const E2E_GATE_WEB_PORT = 3100
export const E2E_GATE_API_PORT = 3101

/**
 * Playwright UI lane — fixed ports so `npm run e2e:ui` never contends with the
 * verify gate on {@link E2E_GATE_WEB_PORT} / {@link E2E_GATE_API_PORT}.
 */
export const E2E_UI_WEB_PORT = 3110
export const E2E_UI_API_PORT = 3111

export const E2E_WEB_PORT = environmentPort('E2E_WEB_PORT', E2E_GATE_WEB_PORT)
export const E2E_API_PORT = environmentPort('E2E_API_PORT', E2E_GATE_API_PORT)
export const E2E_API_BASE = `http://127.0.0.1:${E2E_API_PORT}`
export const E2E_WEB_BASE = `http://127.0.0.1:${E2E_WEB_PORT}`
