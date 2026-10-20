# Media Viewer – Devvit prototype

Prototype port of the Android app (`../android`) to Reddit's Developer Platform. It runs as an interactive post inside Reddit: an inline splash with a feed input, and an expanded vertical swipe feed. Its main purpose is to find out what the Devvit webview allows; the ⓘ button shows a log of media load results and CSP violations.

Built from the official `bare` template (esbuild, no framework).

## Status (paused 2026-10-20)

Work is on hold; nothing has been published.

- App `mediaswipe-proto` is registered to u/SirEarl, test subreddit r/mediaswipe_proto_dev (private). `npm run playtest` resumes; the last playtest version was v0.0.1.19.
- The app is marked NSFW in the Developer Portal (set while testing, no effect on listings). Reddit currently rejects every app marked NSFW in review (Reddit admin in the Devvit Discord, #support-tickets, 2026-10-15). Before publishing, ask Reddit to remove the flag (modmail to r/Devvit or a Discord support ticket), or register a new app.
- Reddit is reworking its NSFW policy for apps; until then there is no way to show NSFW feeds (see below).
- Transferring the app to another account works only through Reddit (modmail to r/Devvit); registering a new app under another name is simpler.
- Not yet checked in the real webview: the diag results (HLS, separate audio, embeds/CSP, images).

## What it tests

| Question | Where to look |
|---|---|
| Listings of any subreddit (`pics+aww` too) and `u/<name>` | Feed loads at all |
| Images from `i.redd.it` / `preview.redd.it` | Status badge `Bild ✓` |
| Reddit video via native HLS (sound included) | `HLS ✓`, diag line `HLS nativ` |
| MP4 fallback with separate audio file (port of `SeparateAudio.kt`) | `MP4 + Ton ✓` |
| YouTube and other embeds in an iframe | diag line `CSP blockiert (frame-src)` |
| Multireddits | Server answers 501, Devvit has no API for them |

NSFW posts are not available in feeds: listings (hot, new) and search run as the app account and omit them (r/WTF hot during playtest: 5 of 25 NSFW on reddit.com, 0 through the app), and NSFW subreddits return no posts at all. `getPostById` does return NSFW posts, so only a known post ID reaches them. Marking the app NSFW in the Developer Portal (done for `mediaswipe-proto`, likely irreversible) changes nothing. Showing them would also need labels and an age gate under the Devvit Rules.

## Structure

- `src/server/server.ts` – `/api/feed` (hot posts of a subreddit or user, 25 per page, `after` cursor), menu item and install trigger that create the post.
- `src/server/media.ts` – Devvit `Post` → `Media`, port of `Post.kt`. Devvit does not expose the raw `preview`, so GIF-to-MP4 previews are missing.
- `src/shared/feed.ts` – `normalize()` from `RedditClient.kt`.
- `src/client/viewer.ts` – scroll-snap feed; only the current page and its two neighbours have media mounted (like `SnapPager`).
- `src/client/mediaview.ts` – image, video (+ separate audio), gallery, embed, link.

## Run

Needs Node 24 and a Reddit account connected to <https://developers.reddit.com>.

```bash
npm install
npx devvit login          # once, opens the browser
npm run playtest          # uploads and installs on a private test subreddit
npm test                  # types, lint, unit tests, build
```

The app name in `devvit.json` (`mediaswipe-proto`) must be unique on Reddit; change it if the upload rejects it.

## Deploy

Reddit hosts client and server; there is no server of your own.

1. `npm run playtest [r/sub]` – test version on a test subreddit (under 200 members), reinstalled on every save, logs stream into the terminal.
2. `npx devvit upload` – fixed version, only visible to you, installable on small subreddits (under 200 members).
3. `npm run publish` – builds, uploads with source and files a review request. Unlisted by default (installable on subreddits you moderate after approval); `npx devvit publish --public` lists it in the App Directory.
4. `npx devvit install r/<sub>` – installs on a subreddit you moderate. The install trigger creates the viewer post; more posts via the subreddit menu "[Media Viewer] New Post".

`npx devvit logs r/<sub>` streams server logs of an installation. `clean` and `watch` are Node scripts (`tools/`) because npm runs scripts in cmd.exe on Windows.
