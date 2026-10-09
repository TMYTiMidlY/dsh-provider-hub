import { applySearchTool } from './index.js'

export const name = 'dsh-web-search-tool'
export const inject = ['tools', 'systemPrompt', 'web', 'credentials']
export const apply = applySearchTool
export default { name, inject, apply }
