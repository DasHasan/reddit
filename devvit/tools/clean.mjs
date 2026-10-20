// Removes build outputs. Node instead of `rm -rf` so it also runs under cmd.exe.
import {readdirSync, rmSync} from 'node:fs'

rmSync('dist', {recursive: true, force: true})
for (const file of readdirSync('public')) {
  if (/\.js(\.map)?$/.test(file)) rmSync(`public/${file}`)
}
