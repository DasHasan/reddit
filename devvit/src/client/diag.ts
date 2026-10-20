/**
 * Collects what the webview allows: media load results and CSP violations.
 * This is the point of the prototype, so it is visible via the ⓘ button.
 */
const lines: string[] = []
const seen = new Set<string>()
let listener: (() => void) | undefined

export function log(line: string): void {
  console.log(`[diag] ${line}`)
  lines.unshift(`${new Date().toLocaleTimeString()} ${line}`)
  lines.length = Math.min(lines.length, 100)
  listener?.()
}

/** Logs [line] only the first time [key] occurs. */
export function logOnce(key: string, line: string): void {
  if (seen.has(key)) return
  seen.add(key)
  log(line)
}

export function diagLines(): readonly string[] {
  return lines
}

export function onDiagChange(fn: () => void): void {
  listener = fn
}

export function watchCsp(): void {
  document.addEventListener('securitypolicyviolation', ev => {
    const host = hostOf(ev.blockedURI)
    logOnce(
      `csp:${ev.effectiveDirective}:${host}`,
      `CSP blockiert (${ev.effectiveDirective}): ${host}`,
    )
  })
  const hls = document.createElement('video').canPlayType(HLS_TYPE)
  log(`HLS nativ: ${hls || 'nein'} · ${navigator.userAgent}`)
}

export const HLS_TYPE = 'application/vnd.apple.mpegurl'

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
