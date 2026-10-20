import {navigateTo} from '@devvit/web/client'
import type {Media} from '../shared/api.ts'
import {HLS_TYPE, hostOf, log, logOnce} from './diag.ts'

/** A rendered media item. Only the item of the current page is active. */
export type MediaView = {
  el: HTMLElement
  activate(): void
  deactivate(): void
  setMuted(muted: boolean): void
  destroy(): void
}

type Status = (text: string) => void

/** Global mute state; videos ask for it when they start. */
export const sound = {muted: false, onForcedMute: (): void => {}}

export function createView(media: Media, status: Status): MediaView {
  switch (media.type) {
    case 'image':
      return imageView(media.url, status)
    case 'video':
      return videoView(media, status)
    case 'gallery':
      return galleryView(media.items, status)
    case 'embed':
      return embedView(media, status)
    case 'link':
      return linkView(media, status)
  }
}

function imageView(url: string, status: Status): MediaView {
  const img = document.createElement('img')
  img.className = 'fill'
  img.decoding = 'async'
  img.alt = ''
  img.addEventListener('load', () => status('Bild ✓'))
  img.addEventListener('error', () => {
    status('Bild ✗')
    logOnce(`img:${hostOf(url)}`, `Bild lädt nicht von ${hostOf(url)}`)
  })
  img.src = url
  return passive(img)
}

function videoView(
  media: Extract<Media, {type: 'video'}>,
  status: Status,
): MediaView {
  const video = document.createElement('video')
  video.className = 'fill'
  video.playsInline = true
  video.loop = true
  video.preload = 'metadata'
  if (media.poster) video.poster = media.poster

  // Native HLS has the sound built in; otherwise the MP4 needs a second player
  const canHls = video.canPlayType(HLS_TYPE) !== ''
  const sources = media.sources.filter(src => canHls || !isHls(src))
  let active = false
  let audio: SeparateAudio | undefined
  let sourceIndex = 0

  const trySource = (): void => {
    const src = sources[sourceIndex]
    if (!src) {
      status('Video ✗')
      logOnce(`video:${hostOf(media.sources[0] ?? '')}`, 'Kein Video spielbar')
      return
    }
    video.src = src
  }
  video.addEventListener('error', () => {
    const src = sources[sourceIndex] ?? ''
    logOnce(
      `video-src:${hostOf(src)}:${isHls(src)}`,
      `Video ✗ ${isHls(src) ? 'HLS' : 'MP4'} von ${hostOf(src)}`,
    )
    sourceIndex++
    trySource()
  })
  video.addEventListener('loadeddata', () => {
    const hls = isHls(sources[sourceIndex] ?? '')
    if (!hls && media.audio.length > 0 && !audio) {
      audio = new SeparateAudio(media.audio, video, ok => {
        status(ok ? 'MP4 + Ton ✓' : 'MP4 ✓ (ohne Ton)')
      })
      audio.setMuted(video.muted)
    }
    status(hls ? 'HLS ✓' : media.audio.length > 0 ? 'MP4 …' : 'Video ✓')
    if (active) play()
  })
  trySource()

  const play = (): void => {
    video.muted = sound.muted
    audio?.setMuted(sound.muted)
    video.play().catch(() => {
      // Autoplay with sound needs a user gesture; retry silently
      if (video.muted) return
      log('Autoplay mit Ton blockiert, stumm geschaltet')
      sound.muted = true
      sound.onForcedMute()
      video.muted = true
      audio?.setMuted(true)
      video.play().catch(() => {})
    })
  }

  return {
    el: video,
    activate() {
      active = true
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play()
    },
    deactivate() {
      active = false
      video.pause()
    },
    setMuted(muted) {
      video.muted = muted
      audio?.setMuted(muted)
    },
    destroy() {
      audio?.release()
      video.removeAttribute('src')
      video.load()
    },
  }
}

/**
 * Port of `SeparateAudio.kt`: plays the sound file next to an MP4 and follows
 * the video, seeking back when the two drift apart (incl. the video looping).
 */
class SeparateAudio {
  #audio = new Audio()
  #ready = false
  #timer: ReturnType<typeof setInterval> | undefined
  readonly video: HTMLVideoElement

  constructor(
    urls: readonly string[],
    video: HTMLVideoElement,
    onResult: (ok: boolean) => void,
  ) {
    this.video = video
    let index = 0
    this.#audio.preload = 'auto'
    this.#audio.loop = true
    this.#audio.addEventListener('error', () => {
      // Wrong file name guess (403): try the next candidate
      index++
      const next = urls[index]
      if (next) this.#audio.src = next
      else onResult(false)
    })
    this.#audio.addEventListener(
      'canplay',
      () => {
        this.#ready = true
        onResult(true)
        this.follow()
      },
      {once: true},
    )
    this.#audio.src = urls[0] ?? ''

    for (const type of ['play', 'pause', 'seeked']) {
      video.addEventListener(type, this.follow)
    }
    this.#timer = setInterval(this.follow, 1000)
  }

  follow = (): void => {
    if (!this.#ready) return
    const a = this.#audio
    if (this.video.paused) {
      if (!a.paused) a.pause()
      return
    }
    if (a.paused) a.play().catch(() => {})
    if (Math.abs(a.currentTime - this.video.currentTime) > 0.25) {
      a.currentTime = this.video.currentTime
    }
  }

  setMuted(muted: boolean): void {
    this.#audio.muted = muted
  }

  release(): void {
    clearInterval(this.#timer)
    this.#audio.pause()
    this.#audio.removeAttribute('src')
    this.#audio.load()
  }
}

function galleryView(items: Media[], status: Status): MediaView {
  const strip = document.createElement('div')
  strip.className = 'gallery'
  const counter = document.createElement('span')
  counter.className = 'counter'
  const views = items.map(item => createView(item, () => {}))
  for (const view of views) {
    const cell = document.createElement('div')
    cell.className = 'cell'
    cell.append(view.el)
    strip.append(cell)
  }

  const update = (): void => {
    const index = Math.round(strip.scrollLeft / Math.max(strip.clientWidth, 1))
    counter.textContent = `${index + 1}/${items.length}`
  }
  strip.addEventListener('scroll', update, {passive: true})
  update()
  status(`Galerie (${items.length})`)

  const wrap = document.createElement('div')
  wrap.className = 'fill'
  wrap.append(strip, counter)
  return {
    el: wrap,
    activate() {},
    deactivate() {},
    setMuted() {},
    destroy() {
      for (const view of views) view.destroy()
    },
  }
}

function embedView(
  media: Extract<Media, {type: 'embed'}>,
  status: Status,
): MediaView {
  const wrap = document.createElement('div')
  wrap.className = 'fill embed'
  if (media.poster) wrap.append(imageView(media.poster, () => {}).el)
  wrap.append(openButton(media.url))
  let frame: HTMLIFrameElement | undefined
  status(`Embed ${hostOf(media.src)} …`)

  return {
    el: wrap,
    activate() {
      // Created per activation so off-screen embeds never play
      frame = document.createElement('iframe')
      frame.className = 'fill'
      frame.allow = 'autoplay; encrypted-media; fullscreen'
      frame.src = media.src
      frame.addEventListener('load', () =>
        status(`Embed ${hostOf(media.src)} geladen?`),
      )
      wrap.append(frame)
    },
    deactivate() {
      frame?.remove()
      frame = undefined
    },
    setMuted() {},
    destroy() {
      frame?.remove()
    },
  }
}

function linkView(
  media: Extract<Media, {type: 'link'}>,
  status: Status,
): MediaView {
  const wrap = document.createElement('div')
  wrap.className = 'fill link'
  if (media.thumbnail) wrap.append(imageView(media.thumbnail, () => {}).el)
  const host = document.createElement('p')
  host.textContent = hostOf(media.url)
  wrap.append(host, openButton(media.url))
  status('Link')
  return passive(wrap)
}

function openButton(url: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'open'
  btn.textContent = `Öffnen ↗ ${hostOf(url)}`
  btn.addEventListener('click', ev => {
    ev.stopPropagation()
    navigateTo(url)
  })
  return btn
}

function passive(el: HTMLElement): MediaView {
  return {
    el,
    activate() {},
    deactivate() {},
    setMuted() {},
    destroy() {},
  }
}

function isHls(url: string): boolean {
  return url.includes('.m3u8')
}
