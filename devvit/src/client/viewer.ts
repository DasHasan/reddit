import {navigateTo} from '@devvit/web/client'
import type {FeedPost} from '../shared/api.ts'
import {label, normalize} from '../shared/feed.ts'
import {diagLines, log, onDiagChange, watchCsp} from './diag.ts'
import {fetchFeed} from './fetch.ts'
import {createView, type MediaView, sound} from './mediaview.ts'
import {loadFeed, saveFeed} from './store.ts'

/** Load the next page when this few posts are left. */
const PRELOAD_REMAINING = 5
/** Pages with only text posts are skipped, but not forever. */
const MAX_EMPTY_PAGES = 3

type Page = {
  post: FeedPost
  section: HTMLElement
  view?: MediaView
}

const feedEl = document.getElementById('feed') as HTMLElement
const form = document.getElementById('feed-form') as HTMLFormElement
const input = document.getElementById('feed-input') as HTMLInputElement
const backBtn = document.getElementById('back-btn') as HTMLButtonElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement
const diagBtn = document.getElementById('diag-btn') as HTMLButtonElement
const diagEl = document.getElementById('diag') as HTMLElement
const messageEl = document.getElementById('message') as HTMLElement

let path = ''
let pages: Page[] = []
let after: string | undefined
let loading = false
let current = -1
/** Bumped per feed so responses for an old feed are dropped. */
let generation = 0
const history: string[] = []

// The page in view becomes current; only it and its neighbours keep media
const observer = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const index = Number((entry.target as HTMLElement).dataset.index)
      setCurrent(index)
    }
  },
  {root: feedEl, threshold: 0.6},
)

function setCurrent(index: number): void {
  if (index === current) return
  pages[current]?.view?.deactivate()
  current = index
  pages.forEach((page, i) => {
    if (Math.abs(i - index) <= 1) mount(page)
    else unmount(page)
  })
  pages[index]?.view?.activate()
  if (pages.length - index <= PRELOAD_REMAINING) void loadMore()
}

function mount(page: Page): void {
  if (page.view) return
  const slot = page.section.querySelector('.media') as HTMLElement
  const status = page.section.querySelector('.status') as HTMLElement
  page.view = createView(page.post.media, text => {
    status.textContent = text
  })
  page.view.setMuted(sound.muted)
  slot.replaceChildren(page.view.el)
}

function unmount(page: Page): void {
  if (!page.view) return
  page.view.destroy()
  page.view = undefined
  page.section.querySelector('.media')?.replaceChildren()
}

function openFeed(input: string, remember: boolean): void {
  const next = normalize(input)
  if (remember && path && next !== path) history.push(path)
  backBtn.hidden = history.length === 0

  for (const page of pages) unmount(page)
  observer.disconnect()
  feedEl.replaceChildren()
  pages = []
  after = undefined
  current = -1
  loading = false
  generation++

  path = next
  setInput()
  saveFeed(path)
  showMessage('Lädt …')
  void loadMore()
}

async function loadMore(): Promise<void> {
  if (loading || (pages.length > 0 && !after)) return
  loading = true
  const gen = generation

  for (let empty = 0; empty < MAX_EMPTY_PAGES; empty++) {
    const rsp = await fetchFeed({path, ...(after && {after})})
    if (gen !== generation) return
    if (typeof rsp === 'string') {
      log(`Feed ${label(path)}: ${rsp}`)
      if (pages.length === 0) showMessage(rsp)
      break
    }
    after = rsp.after
    for (const post of rsp.posts) addPage(post)
    if (rsp.posts.length > 0 || !after) break
  }

  loading = false
  if (pages.length === 0) showMessage('Keine Medien-Posts gefunden')
  else showMessage(undefined)
}

function addPage(post: FeedPost): void {
  const section = document.createElement('section')
  section.className = 'page'
  section.dataset.index = `${pages.length}`

  const media = document.createElement('div')
  media.className = 'media'
  const status = document.createElement('span')
  status.className = 'status'
  section.append(media, status, info(post))
  section.addEventListener('click', () =>
    document.body.classList.toggle('hide-info'),
  )

  pages.push({post, section})
  feedEl.append(section)
  observer.observe(section)
}

function info(post: FeedPost): HTMLElement {
  const el = document.createElement('div')
  el.className = 'info'
  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = post.title
  const meta = document.createElement('p')
  meta.className = 'meta'
  meta.append(
    metaLink(`r/${post.subreddit}`, () => openFeed(post.subreddit, true)),
    metaLink(`u/${post.author}`, () => openFeed(`u/${post.author}`, true)),
    metaText(`▲ ${post.score}`),
    metaText(`💬 ${post.comments}`),
    metaLink('↗', () => navigateTo(`https://www.reddit.com${post.permalink}`)),
  )
  el.append(title, meta)
  return el
}

function metaLink(text: string, onClick: () => void): HTMLElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = text
  btn.addEventListener('click', ev => {
    ev.stopPropagation()
    onClick()
  })
  return btn
}

function metaText(text: string): HTMLElement {
  const span = document.createElement('span')
  span.textContent = text
  return span
}

function showMessage(text: string | undefined): void {
  messageEl.hidden = text === undefined
  messageEl.textContent = text ?? ''
}

function setInput(): void {
  input.value = label(path)
}

function setMuted(muted: boolean): void {
  sound.muted = muted
  muteBtn.textContent = muted ? '🔇' : '🔊'
  pages[current]?.view?.setMuted(muted)
}

function renderDiag(): void {
  if (diagEl.hidden) return
  diagEl.textContent = diagLines().join('\n') || 'Noch nichts protokolliert'
}

form.addEventListener('submit', ev => {
  ev.preventDefault()
  input.blur()
  openFeed(input.value, true)
})
backBtn.addEventListener('click', () => {
  const previous = history.pop()
  if (previous) openFeed(previous, false)
})
muteBtn.addEventListener('click', () => setMuted(!sound.muted))
diagBtn.addEventListener('click', () => {
  diagEl.hidden = !diagEl.hidden
  renderDiag()
})
sound.onForcedMute = () => setMuted(true)
onDiagChange(renderDiag)

watchCsp()
setMuted(false)
openFeed(loadFeed() ?? 'pics', false)
