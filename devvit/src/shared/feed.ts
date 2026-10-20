const MULTI_URL =
  /(?:https?:\/\/)?(?:www\.|old\.)?reddit\.com\/(user\/[^/]+\/m\/[^/?#]+)/i
const SUB_URL = /(?:https?:\/\/)?(?:www\.|old\.)?reddit\.com\/r\/([^/?#]+)/i
const USER_URL =
  /(?:https?:\/\/)?(?:www\.|old\.)?reddit\.com\/(?:u|user)\/([^/?#]+)\/?$/i

/**
 * Port of `RedditClient.normalize()` from the Android app: sub name, `r/`
 * prefix, `u/` prefix, multi path or full URL. Returns `pics`, `pics+aww`,
 * `user/<name>` or `user/<name>/m/<multi>`.
 */
export function normalize(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, '') || 'pics'
  const multi = MULTI_URL.exec(trimmed)
  if (multi?.[1]) return multi[1]
  const sub = SUB_URL.exec(trimmed)
  if (sub?.[1]) return sub[1]
  const user = USER_URL.exec(trimmed)
  if (user?.[1]) return `user/${user[1]}`
  if (trimmed.startsWith('u/')) return `user/${trimmed.slice(2)}`
  if (trimmed.startsWith('r/')) return trimmed.slice(2)
  return trimmed
}

/** Feed path for display in the input field. */
export function label(path: string): string {
  return path.startsWith('user/') ? path : `r/${path}`
}
