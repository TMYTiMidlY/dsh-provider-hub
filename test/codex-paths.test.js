import test from 'node:test'
import assert from 'node:assert/strict'
import { codexDirectoryPath } from '../lib/codex-paths.js'
const linux = { home: '/home/test', platform: 'linux', env: {}, kernelRelease: 'Linux' }
const windows = { home: 'C:\\Users\\test', platform: 'win32', env: {}, kernelRelease: 'Windows' }
test('POSIX absolute/home/auth-file paths resolve without shell expansion', async () => {
  for (const [value, expected] of [['~/.codex','/home/test/.codex'], ['~\\.codex','/home/test/.codex'], ['$HOME/.codex','/home/test/.codex'], ['${HOME}/.codex','/home/test/.codex'], ['/tmp/cli/auth.json','/tmp/cli'], ['/tmp/../tmp/cli','/tmp/cli']]) assert.equal(await codexDirectoryPath(value, linux), expected)
})
test('native Windows accepts fully qualified drives, home and UNC including admin shares', async () => {
  for (const [value, expected] of [['C:\\Users\\me\\.codex','C:\\Users\\me\\.codex'], ['C:/Users/me/.codex/auth.json','C:\\Users\\me\\.codex'], ['~\\.codex','C:\\Users\\test\\.codex'], ['\\\\server\\share\\cli','\\\\server\\share\\cli'], ['\\\\server\\C$\\cli','\\\\server\\C$\\cli']]) assert.equal(await codexDirectoryPath(value, windows), expected)
  for (const value of ['C:relative','\\relative','/relative','\\\\server']) await assert.rejects(codexDirectoryPath(value, windows), /完整盘符/u)
  for (const value of ['\\\\.\\pipe\\secret', '\\\\?\\GLOBALROOT\\Device']) await assert.rejects(codexDirectoryPath(value, windows), /设备命名空间/u)
})
test('Windows drive paths on WSL use the bounded converter, not guessed mount roots', async () => {
  const seen = []
  const options = { ...linux, kernelRelease: '6.6-microsoft-standard-WSL2', convertWindowsPath: async value => { seen.push(value); return '/custom-mount/c/Users/me/.codex/auth.json' } }
  assert.equal(await codexDirectoryPath('C:\\Users\\me\\.codex\\auth.json', options), '/custom-mount/c/Users/me/.codex')
  assert.deepEqual(seen, ['C:\\Users\\me\\.codex\\auth.json'])
  await assert.rejects(codexDirectoryPath('C:\\Users\\me', { ...options, convertWindowsPath: async () => 'relative' }), /转换失败/u)
})
test('WSL UNC paths must name the running distribution; network UNC is not guessed', async () => {
  const options = { ...linux, env: { WSL_DISTRO_NAME: 'Ubuntu' } }
  for (const value of ['\\\\wsl.localhost\\Ubuntu\\home\\test\\.codex', '\\\\wsl$\\ubuntu\\home\\test\\.codex']) assert.equal(await codexDirectoryPath(value, options), '/home/test/.codex')
  await assert.rejects(codexDirectoryPath('\\\\wsl.localhost\\Debian\\home\\test', options), /当前 WSL/u)
  await assert.rejects(codexDirectoryPath('\\\\server\\share', options), /UNC/u)
})
test('non-WSL Linux refuses browser-host Windows paths; malformed input is rejected', async () => {
  await assert.rejects(codexDirectoryPath('C:\\Users\\me\\.codex', linux), /非 Windows/u)
  for (const value of ['', 'relative', '/tmp/$(id)', '/tmp/$OTHER', '/tmp/`id`', '/tmp/a\nb', '/tmp/a\0b', 'a'.repeat(4097), null, {}]) await assert.rejects(codexDirectoryPath(value, linux))
})
