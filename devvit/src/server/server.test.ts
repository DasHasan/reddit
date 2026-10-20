import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import type {AddressInfo, Server} from 'node:net'
import {after, before, test} from 'node:test'
import {type Context, reddit, runWithContext} from '@devvit/web/server'
import {
  Endpoint,
  type ErrorRsp,
  type FeedReq,
  type FeedRsp,
} from '../shared/api.ts'
import {onReq} from './server.ts'

let server: Server
let serverURL: string
const getHotPosts = reddit.getHotPosts.bind(reddit)
let hotRequests: unknown[] = []

const imagePost = {
  id: 't3_img',
  title: 'Cat',
  authorName: 'alice',
  subredditName: 'pics',
  permalink: '/r/pics/comments/img/cat/',
  score: 5,
  numberOfComments: 2,
  nsfw: false,
  url: 'https://i.redd.it/cat.jpg',
  gallery: [{status: 1, url: 'https://preview.redd.it/cat.jpg'}],
}
const textPost = {
  ...imagePost,
  id: 't3_txt',
  url: 'https://www.reddit.com/r/pics/comments/txt/',
  gallery: [],
}
const nsfwPost = {...imagePost, id: 't3_nsfw', nsfw: true}

before(async () => {
  reddit.getHotPosts = ((options: unknown) => {
    hotRequests.push(options)
    return {get: async () => [imagePost, textPost, nsfwPost]}
  }) as unknown as typeof reddit.getHotPosts

  server = createServer(async (req, rsp) => {
    await runWithContext(
      {
        appName: 'mediaswipe-proto',
        postId: 't3_123',
        userId: 't2_123',
        username: 'username',
      } as unknown as Context,
      () => onReq(req, rsp),
    )
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const info = server.address() as AddressInfo
  serverURL = `http://127.0.0.1:${info.port}`
})

after(async () => {
  reddit.getHotPosts = getHotPosts
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()))
  })
})

function postFeed(req: FeedReq): Promise<Response> {
  return fetch(`${serverURL}/${Endpoint.Feed}`, {
    body: JSON.stringify(req),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
  })
}

test('feed keeps media posts and drops text and NSFW posts', async () => {
  hotRequests = []
  const rsp = await postFeed({path: 'r/pics', after: 't3_prev'})
  assert.equal(rsp.status, 200)
  assert.deepEqual<FeedRsp>(await rsp.json(), {
    posts: [
      {
        id: 't3_img',
        title: 'Cat',
        author: 'alice',
        subreddit: 'pics',
        permalink: '/r/pics/comments/img/cat/',
        score: 5,
        comments: 2,
        media: {type: 'image', url: 'https://preview.redd.it/cat.jpg'},
      },
    ],
    rawCount: 3,
  })
  assert.deepEqual(hotRequests, [
    {subredditName: 'pics', limit: 25, pageSize: 25, after: 't3_prev'},
  ])
})

test('multireddits are rejected', async () => {
  const rsp = await postFeed({path: 'user/alice/m/cats'})
  assert.equal(rsp.status, 501)
})

test('wrong method', async () => {
  const rsp = await fetch(`${serverURL}/${Endpoint.Feed}`)
  assert.equal(rsp.status, 404)
  assert.deepEqual<ErrorRsp>(await rsp.json(), {
    error: 'not found',
    status: 404,
  })
})

test('404', async () => {
  const rsp = await fetch(serverURL)
  assert.equal(rsp.status, 404)
  assert.deepEqual<ErrorRsp>(await rsp.json(), {
    error: 'not found',
    status: 404,
  })
})
