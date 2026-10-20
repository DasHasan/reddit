import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {Media} from '../shared/api.ts'
import {audioSources, detectMedia, type PostLike} from './media.ts'

const base: PostLike = {
  url: 'https://www.reddit.com/r/x/comments/1/',
  gallery: [],
}

test('reddit video prefers HLS and guesses the audio file', () => {
  const media = detectMedia({
    ...base,
    url: 'https://v.redd.it/abc',
    gallery: [{status: 1, url: 'https://preview.redd.it/poster.jpg'}],
    secureMedia: {
      redditVideo: {
        fallbackUrl: 'https://v.redd.it/abc/DASH_720.mp4?source=fallback',
        hlsUrl: 'https://v.redd.it/abc/HLSPlaylist.m3u8',
      },
    },
  })
  assert.deepEqual<Media | undefined>(media, {
    type: 'video',
    sources: [
      'https://v.redd.it/abc/HLSPlaylist.m3u8',
      'https://v.redd.it/abc/DASH_720.mp4?source=fallback',
    ],
    audio: audioSources('https://v.redd.it/abc/DASH_720.mp4'),
    poster: 'https://preview.redd.it/poster.jpg',
  })
})

test('GIF videos have no audio', () => {
  const media = detectMedia({
    ...base,
    secureMedia: {
      redditVideo: {
        fallbackUrl: 'https://v.redd.it/abc/DASH_480.mp4',
        isGif: true,
      },
    },
  })
  assert.equal(media?.type === 'video' && media.audio.length, 0)
})

test('audio candidates for DASH and CMAF', () => {
  assert.deepEqual(audioSources('https://v.redd.it/abc/CMAF_480.mp4'), [
    'https://v.redd.it/abc/CMAF_AUDIO_128.mp4',
    'https://v.redd.it/abc/CMAF_AUDIO_64.mp4',
    'https://v.redd.it/abc/DASH_audio.mp4',
  ])
  assert.deepEqual(audioSources('https://example.com/video.mp4'), [])
})

test('gallery keeps valid items only', () => {
  const media = detectMedia({
    ...base,
    url: 'https://www.reddit.com/gallery/abc',
    gallery: [
      {status: 1, url: 'https://i.redd.it/1.jpg'},
      {status: 2, url: 'https://i.redd.it/broken.jpg'},
      {status: 1, url: 'https://i.redd.it/2.jpg'},
    ],
  })
  assert.deepEqual<Media | undefined>(media, {
    type: 'gallery',
    items: [
      {type: 'image', url: 'https://i.redd.it/1.jpg'},
      {type: 'image', url: 'https://i.redd.it/2.jpg'},
    ],
  })
})

test('embed src is taken from the oEmbed iframe', () => {
  const media = detectMedia({
    ...base,
    url: 'https://youtu.be/xyz',
    secureMedia: {
      oembed: {
        html: '<iframe src="https://www.youtube.com/embed/xyz?a=1&amp;b=2"></iframe>',
        thumbnailUrl: 'https://i.ytimg.com/xyz.jpg',
      },
    },
  })
  assert.deepEqual<Media | undefined>(media, {
    type: 'embed',
    src: 'https://www.youtube.com/embed/xyz?a=1&b=2',
    url: 'https://youtu.be/xyz',
    poster: 'https://i.ytimg.com/xyz.jpg',
  })
})

test('external link with preview stays a link', () => {
  const media = detectMedia({
    ...base,
    url: 'https://example.com/article',
    gallery: [{status: 1, url: 'https://preview.redd.it/article.jpg'}],
  })
  assert.deepEqual<Media | undefined>(media, {
    type: 'link',
    url: 'https://example.com/article',
    thumbnail: 'https://preview.redd.it/article.jpg',
  })
})

test('gifv becomes mp4', () => {
  const media = detectMedia({...base, url: 'https://i.imgur.com/abc.gifv'})
  assert.equal(
    media?.type === 'video' && media.sources[0],
    'https://i.imgur.com/abc.mp4',
  )
})

test('text post has no media', () => {
  assert.equal(detectMedia(base), undefined)
})
