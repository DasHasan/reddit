/** Generic error detail for all responses. */
export type ErrorRsp = {error: string; status: number}

/**
 * One media item. Video [sources] and [audio] are each tried in order until one
 * plays; Reddit serves picture and sound of the MP4 fallback as separate files,
 * while the HLS playlist carries both.
 */
export type Media =
  | {type: 'image'; url: string}
  | {type: 'video'; sources: string[]; audio: string[]; poster?: string}
  | {type: 'gallery'; items: Media[]}
  | {type: 'embed'; src: string; url: string; poster?: string}
  | {type: 'link'; url: string; thumbnail?: string}

export type FeedPost = {
  id: string
  title: string
  author: string
  subreddit: string
  permalink: string
  score: number
  comments: number
  media: Media
}

/** `path` as returned by `normalize()`; `after` is the cursor of the previous page. */
export type FeedReq = {path: string; after?: string}
export type FeedRsp = {posts: FeedPost[]; after?: string; rawCount: number}

export type Endpoint = (typeof Endpoint)[keyof typeof Endpoint]
export const Endpoint = {
  Feed: 'api/feed',
  OnAppInstall: 'internal/on/app/install',
  OnMenuNewPost: 'internal/on/menu/new-post',
} as const

export const EndpointMethod = {
  [Endpoint.Feed]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
} as const satisfies {[endpoint: string]: 'GET' | 'POST'}
