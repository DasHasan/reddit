import {
  Endpoint,
  type ErrorRsp,
  type FeedReq,
  type FeedRsp,
} from '../shared/api.ts'

/** Returns the feed page or an error message for display. */
export async function fetchFeed(req: FeedReq): Promise<FeedRsp | string> {
  let rsp
  try {
    rsp = await fetch(Endpoint.Feed, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify(req),
    })
  } catch (err) {
    return `HTTP error: ${err instanceof Error ? err.message : err}`
  }

  if (!rsp.ok) {
    const body = (await rsp.json().catch(() => undefined)) as
      | ErrorRsp
      | undefined
    return body?.error ?? `HTTP status ${rsp.status}: ${rsp.statusText}`
  }

  return (await rsp.json()) as FeedRsp
}
