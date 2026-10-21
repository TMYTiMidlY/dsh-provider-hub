import { execFile } from 'node:child_process'
import { homedir, release } from 'node:os'
import { posix, win32 } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const windowsDrive = value => /^[a-z]:[\\/]/iu.test(value)
const unc = value => /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/u.test(value)
async function windowsToWsl(value) {
  try {
    const { stdout } = await exec('wslpath', ['-u', value], { timeout: 2000, maxBuffer: 16384, windowsHide: true })
    const path = stdout.trim()
    if (!posix.isAbsolute(path) || /[\0\r\n]/u.test(path)) throw new Error('Invalid converted path')
    return path
  } catch { throw new Error('无法转换 Windows 路径；请通过“选择目录”选择 DSH 所在机器的目录') }
}

/** Resolve server-side Codex homes; never interpret a path on the browser host. */
export async function codexDirectoryPath(value, { home = homedir(), platform = process.platform, env = process.env, kernelRelease = release(), convertWindowsPath = windowsToWsl } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\0\r\n]/u.test(value)) throw new Error('请填写 DSH 所在机器的绝对目录或 ~/目录')
  let path = value.trim()
  const ops = platform === 'win32' ? win32 : posix
  const homePrefix = /^(?:~|\$\{HOME\}|\$HOME)(?=[\\/]|$)/u
  if (homePrefix.test(path)) {
    const rest = path.replace(homePrefix, '').replace(/^[\\/]+/u, '').replace(/[\\/]/gu, ops.sep)
    path = ops.join(home, rest)
  }
  if (/\$(?:\{|[a-z_(])|`/iu.test(path.replace(/^\\\\wsl\$(?=[\\/])/iu, ''))) throw new Error('路径不能包含未展开的变量或命令')
  if (platform === 'win32') {
    if (/^\\\\[.?][\\/]/u.test(path)) throw new Error('不支持 Windows 设备命名空间；请选择盘符目录或 UNC 共享目录')
    if (!windowsDrive(path) && !unc(path)) throw new Error('Windows 路径需要完整盘符（如 C:\\Users\\me\\.codex）或 UNC 共享目录')
  } else if (windowsDrive(path) || path.startsWith('\\\\')) {
    const wsl = !!env.WSL_DISTRO_NAME || /microsoft|wsl/iu.test(kernelRelease)
    if (!wsl) throw new Error('此 DSH 运行在非 Windows 主机；请填写服务器目录，而不是浏览器电脑的 Windows 路径')
    const shared = /^\\\\(?:wsl\$|wsl\.localhost)[\\/]([^\\/]+)([\\/].*)?$/iu.exec(path)
    if (shared) {
      if (!env.WSL_DISTRO_NAME || shared[1].toLowerCase() !== env.WSL_DISTRO_NAME.toLowerCase()) throw new Error('该路径不是当前 WSL 发行版；请选择当前 DSH 所在机器的目录')
      path = (shared[2] || '/').replace(/\\/gu, '/')
    } else {
      if (!windowsDrive(path)) throw new Error('WSL 中请使用 Windows 盘符路径或已经挂载的 Linux 目录，不支持直接访问 UNC 网络共享')
      path = await convertWindowsPath(path)
    }
    if (!posix.isAbsolute(path) || /[\0\r\n]/u.test(path)) throw new Error('Windows 路径转换失败，请选择服务器目录')
  }
  if (!ops.isAbsolute(path)) throw new Error('请填写 DSH 所在机器的绝对目录或 ~/目录')
  path = ops.resolve(path)
  const filename = ops.basename(path)
  return (platform === 'win32' ? filename.toLowerCase() === 'auth.json' : filename === 'auth.json') ? ops.dirname(path) : path
}
