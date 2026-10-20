// Last feed, handed from the inline splash to the expanded viewer. localStorage
// can throw or be cleared (it resets on every app update), so it is optional.
const KEY = 'feed'

export function loadFeed(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function saveFeed(path: string): void {
  try {
    localStorage.setItem(KEY, path)
  } catch {
    // Not persisted; the viewer falls back to r/pics
  }
}
