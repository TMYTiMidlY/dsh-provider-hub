import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Default to the locked development Host graph. A real installed Host can be
// supplied explicitly for the second acceptance layer; never silently skip it.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = { ...process.env }
env.DSH_TEST_RUNTIME_ROOT ??= root
env.DSH_TEST_PRIMITIVES_ROOT ??= join(root, 'node_modules/@deepseek-ai/dsh-client-ui-primitives')
const files = readdirSync(join(root, 'test')).filter(name => name.endsWith('.test.js')).sort().map(name => join(root, 'test', name))
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, env, encoding: 'utf8', maxBuffer: 16_000_000 })
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
if (result.error) { console.error(result.error); process.exitCode = 1 }
else if (result.status !== 0) process.exitCode = result.status ?? 1
else if (!/^# tests [1-9][0-9]*$/m.test(result.stdout) || !/^# skipped 0$/m.test(result.stdout) || !/^# todo 0$/m.test(result.stdout)) {
  console.error('Acceptance requires nonempty tests, zero skips and zero TODOs; configure the complete locked Host graph.')
  process.exitCode = 1
}
