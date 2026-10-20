import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {type Post, reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type ErrorRsp,
  type FeedPost,
  type FeedReq,
  type FeedRsp,
} from '../shared/api.ts'
import {normalize} from '../shared/feed.ts'
import {detectMedia} from './media.ts'

type AnyRsp = FeedRsp | UiResponse | TriggerResponse | ErrorRsp

const PAGE_SIZE = 25
const POST_TITLE = 'Media Viewer'

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1).split('?')[0] as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.Feed:
        rsp = await routeFeed(reqMsg)
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

async function routeFeed(reqMsg: IncomingMessage): Promise<FeedRsp | ErrorRsp> {
  const req = await readJson<FeedReq>(reqMsg)
  const path = normalize(req.path)
  if (/^user\/[^/]+\/m\//.test(path)) {
    return {error: 'Multireddits bietet die Devvit-API nicht an', status: 501}
  }

  const options = {
    limit: PAGE_SIZE,
    pageSize: PAGE_SIZE,
    ...(req.after && {after: req.after}),
  }
  const listing = path.startsWith('user/')
    ? reddit.getPostsByUser({
        username: path.slice('user/'.length),
        sort: 'hot',
        ...options,
      })
    : reddit.getHotPosts({subredditName: path, ...options})

  let raw: Post[]
  try {
    raw = await listing.get(PAGE_SIZE)
  } catch (err) {
    const msg = err instanceof Error ? err.message : `${err}`
    return {error: `Reddit-Fehler: ${msg}`, status: 502}
  }

  // Listings and search run as the app account and omit NSFW posts (playtest:
  // r/WTF hot had 5 of 25 on reddit.com, 0 here; getPostById still returns
  // them); the filter only guards against that changing
  const posts = await Promise.all(raw.filter(p => !p.nsfw).map(toFeedPost))
  const last = raw.at(-1)
  return {
    posts: posts.filter(post => post !== undefined),
    rawCount: raw.length,
    ...(raw.length === PAGE_SIZE && last && {after: last.id}),
  }
}

async function toFeedPost(post: Post): Promise<FeedPost | undefined> {
  // Crossposts carry their media on the original post
  const parentId = post.crosspostParentId
  const source = parentId
    ? await reddit.getPostById(parentId).catch(() => post)
    : post
  const media = detectMedia(source)
  if (!media) return
  return {
    id: post.id,
    title: post.title,
    author: post.authorName,
    subreddit: post.subredditName,
    permalink: post.permalink,
    score: post.score,
    comments: post.numberOfComments,
    media,
  }
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: POST_TITLE})
  return {
    showToast: {text: `Post ${post.id} created.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({title: POST_TITLE})
  return {}
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  return JSON.parse(`${Buffer.concat(chunks)}`)
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  const len = Buffer.byteLength(body)
  rsp.writeHead(status, {
    'Content-Length': len,
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
