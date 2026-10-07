import test from 'node:test'
import assert from 'node:assert/strict'
import {
  capSources,
  citeableUrl,
  mapCodex,
  mapZai,
  normalizeQuery,
  parseReaderPayload,
  storedApiKey,
  storedGrantAccess,
} from '../lib/search.js'

test('normalizes and bounds search queries', () => {
  assert.equal(normalizeQuery('  hello web  '), 'hello web')
  assert.throws(() => normalizeQuery('   '), /1-4096/)
  assert.equal(citeableUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(citeableUrl('javascript:alert(1)'), undefined)
})

test('deduplicates and caps sources', () => {
  assert.deepEqual(capSources([{ url: 'https://a' }, { url: 'https://a' }, { url: 'https://b' }], 1), {
    sources: [{ url: 'https://a' }], truncated: true,
  })
})

test('reads pi-ai grant and api-key records without exposing credentials', () => {
  assert.equal(storedGrantAccess({ kind: 'grant', payload: { type: 'oauth', access: 'token', expires: Date.now() + 60_000 } }), 'token')
  assert.equal(storedGrantAccess({ kind: 'grant', payload: { type: 'oauth', access: 'expired', expires: Date.now() - 1 } }), undefined)
  assert.equal(storedApiKey({ kind: 'api-key', key: 'sk-test' }), 'sk-test')
})

test('maps Codex responses into normalized sources', () => {
  const result = mapCodex({ output: 'answer', results: [
    { type: 'text_result', url: 'https://example.com', title: 'Example', snippet: 'snippet' },
    { type: 'image_result', url: 'https://ignored.example' },
  ] }, 8)
  assert.equal(result.content, 'answer')
  assert.deepEqual(result.sources, [{ url: 'https://example.com/', title: 'Example', snippet: 'snippet' }])
})

test('maps double-encoded Z.AI MCP response', () => {
  const encoded = JSON.stringify(JSON.stringify([{ link: 'https://example.com', title: 'Example', content: 'digest', publish_date: '2026-01-01' }]))
  const result = mapZai({ result: { content: [{ type: 'text', text: encoded }] } }, 8)
  assert.equal(result.sources[0].title, 'Example')
  assert.equal(result.sources[0].snippet, 'digest')
})

test('maps zread text into citations', () => {
  const result = parseReaderPayload('Google result https://example.com/a and https://example.com/b.', 8)
  assert.equal(result.sources.length, 2)
  assert.equal(result.sources[0].url, 'https://example.com/a')
})
