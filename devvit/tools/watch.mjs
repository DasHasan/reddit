// Rebuilds client and server on change. Node instead of `sh -c` so it also
// runs under cmd.exe; stopping this process stops both watchers.
import {spawn} from 'node:child_process'

const children = ['build:client', 'build:server'].map(script =>
  spawn(`npm run ${script} -- --watch=forever`, {
    shell: true,
    stdio: 'inherit',
  }),
)
const stop = () => {
  for (const child of children) child.kill()
  process.exit()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) child.on('exit', stop)
