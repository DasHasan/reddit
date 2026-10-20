import {requestExpandedMode} from '@devvit/web/client'
import {label, normalize} from '../shared/feed.ts'
import {loadFeed, saveFeed} from './store.ts'

const form = document.getElementById('start-form') as HTMLFormElement
const input = document.getElementById('feed-input') as HTMLInputElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement

input.value = label(loadFeed() ?? 'pics')
form.addEventListener('submit', ev => ev.preventDefault())
startBtn.addEventListener('click', ev => {
  saveFeed(normalize(input.value))
  requestExpandedMode(ev, 'viewer')
})
