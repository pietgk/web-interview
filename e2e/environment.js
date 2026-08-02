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

export const E2E_WEB_PORT = environmentPort('E2E_WEB_PORT', 3100)
export const E2E_API_PORT = environmentPort('E2E_API_PORT', 3101)
export const E2E_API_BASE = `http://127.0.0.1:${E2E_API_PORT}`
export const E2E_WEB_BASE = `http://127.0.0.1:${E2E_WEB_PORT}`
