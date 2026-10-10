// Compatibility entry for sessions created by <= 0.1.0-local.4.
// Not installed into any preset by this package. The native tool always uses the global route.
import z from '@deepseek-ai/schemastery'
import { applyWebSearchTool } from '@deepseek-ai/dsh-tool-web'

export const name = 'dsh-web-search-tool-compat'
export const inject = ['tools', 'systemPrompt', 'web']
export const Config = z.object({
  maxResults: z.number().step(1).min(1).default(8),
  timeoutMs: z.number().step(1).min(1).default(60000),
})
export function apply(ctx, config) {
  applyWebSearchTool(ctx, config.maxResults, 4, config.timeoutMs, true)
}
export default { name, inject, Config, apply }
