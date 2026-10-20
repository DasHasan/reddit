import assert from 'node:assert/strict'
import {test} from 'node:test'
import {label, normalize} from './feed.ts'

test('normalize', () => {
  const cases: [string, string][] = [
    ['', 'pics'],
    ['  aww ', 'aww'],
    ['r/pics+aww', 'pics+aww'],
    ['/r/pics', 'pics'],
    ['u/spez', 'user/spez'],
    ['https://www.reddit.com/r/EarthPorn/top/?t=week', 'EarthPorn'],
    ['https://old.reddit.com/user/alice/m/cats/', 'user/alice/m/cats'],
    ['https://www.reddit.com/user/alice/', 'user/alice'],
    ['user/alice/m/cats', 'user/alice/m/cats'],
  ]
  for (const [input, expected] of cases) {
    assert.equal(normalize(input), expected, input)
  }
})

test('label', () => {
  assert.equal(label('pics'), 'r/pics')
  assert.equal(label('user/alice'), 'user/alice')
})
