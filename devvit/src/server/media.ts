import type {Media} from '../shared/api.ts'

/**
 * The subset of the Devvit `Post` this parser reads. Devvit does not expose the
 * raw `preview` object, so GIF-to-MP4 previews of the Android app are missing.
 */
export type PostLike = {
  url: string
  thumbnail?: {url: string} | undefined
  gallery: {status: number; url: string}[]
  secureMedia?:
    | {
        oembed?: {html: string; thumbnailUrl?: string | undefined} | undefined
        redditVideo?:
          | {
              fallbackUrl?: string | undefined
              hlsUrl?: string | undefined
              isGif?: boolean | undefined
            }
          | undefined
      }
    | undefined
}

const GALLERY_VALID = 1
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?.*)?$/i
const GIFV = /\.gifv(\?.*)?$/i
const EMBED_SRC = /src=["']([^"']+)["']/
const VIDEO_FILE = /^(https:\/\/v\.redd\.it\/[^/]+\/)(DASH|CMAF)_/

/** Returns undefined for posts without media (e.g. text-only self posts). */
export function detectMedia(p: PostLike): Media | undefined {
  const images = p.gallery
    .filter(item => item.status === GALLERY_VALID)
    .map(item => item.url)
  const poster = images[0] ?? p.thumbnail?.url

  const video = p.secureMedia?.redditVideo
  if (video) {
    const fallback = video.fallbackUrl
    // HLS first: unlike the MP4 fallback it includes the sound
    const sources = [video.hlsUrl, fallback].filter(url => url !== undefined)
    const audio = fallback && !video.isGif ? audioSources(fallback) : []
    return {type: 'video', sources, audio, ...(poster && {poster})}
  }

  if (images.length > 1) {
    return {
      type: 'gallery',
      items: images.map(url => ({type: 'image', url})),
    }
  }

  const embed = p.secureMedia?.oembed
  const src = embed && EMBED_SRC.exec(embed.html)?.[1]
  if (embed && src) {
    const thumb = embed.thumbnailUrl ?? poster
    return {
      type: 'embed',
      src: decodeEntities(src),
      url: p.url,
      ...(thumb && {poster: thumb}),
    }
  }

  if (GIFV.test(p.url)) {
    return {
      type: 'video',
      sources: [p.url.replace(GIFV, '.mp4')],
      audio: [],
      ...(poster && {poster}),
    }
  }

  // For non-gallery posts `gallery` holds the preview, which link posts have too
  const external = !p.url.includes('reddit.com') && !p.url.includes('redd.it')
  if (IMAGE_EXT.test(p.url) || (images[0] && !external)) {
    return {type: 'image', url: images[0] ?? p.url}
  }

  // Self posts link to themselves on reddit.com and fall through
  if (external) {
    return {type: 'link', url: p.url, ...(poster && {thumbnail: poster})}
  }
  return poster ? {type: 'image', url: poster} : undefined
}

/**
 * Audio lives next to the video file and shares its prefix:
 * .../DASH_720.mp4 -> .../DASH_AUDIO_128.mp4, .../CMAF_480.mp4 -> .../CMAF_AUDIO_128.mp4
 */
export function audioSources(fallbackUrl: string): string[] {
  const match = VIDEO_FILE.exec(fallbackUrl)
  if (!match) return []
  const [, base, prefix] = match
  return [
    `${base}${prefix}_AUDIO_128.mp4`,
    `${base}${prefix}_AUDIO_64.mp4`,
    `${base}DASH_audio.mp4`,
  ]
}

function decodeEntities(html: string): string {
  return html
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}
