// Optional real-browser layout acceptance with synthetic accounts, never credentials.
// Install isolated tools: npm i --prefix node_modules/.ui-acceptance --ignore-scripts react@19 react-dom@19 esbuild
// PLAYWRIGHT_MODULE may point to an existing playwright-core/index.mjs.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tools = join(root, 'node_modules/.ui-acceptance')
const require = createRequire(join(tools, 'package.json'))
const { build } = require('esbuild')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = join(tools, 'artifacts')
await mkdir(output, { recursive: true })
const source = await readFile(join(root, 'lib/client.js'), 'utf8')
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
let registered;
window.__ModuleLoader__={load:entry=>{registered=entry}};
${source}
const dictionaries={};
let Card, Actions;
const config=window.fixtureConfig||{};
const defaultName='默认账号'; // Backend-owned stored name; only the virtual UI default is localized.
const defaultEntries=[{id:'11111111',name:'work@example.test',email:'work@example.test',active:true,source:'cli',sourcePath:'/home/demo/.codex'},{id:'22222222',name:'Personal account with a deliberately long display name / 个人账号名称用于窄屏测试',email:'personal@example.test',active:false,source:'web'}];
const state=window.fixture={scans:0,imports:0,switches:0,partial:false,delay:600,sourceRequests:[],importRequests:[],quotaRequests:[],historyRequests:[],addRequests:[],renameRequests:[],listRequests:0,directoryRequests:[],directoryPending:[],directoryAborts:0,directoryHold:false,directoryFailNext:false,entries:structuredClone(config.entries??defaultEntries)};
const success=value=>({ok:true,value});
const list=async()=>{state.listRequests++;return success({entries:structuredClone(state.entries)})};
const rename=async request=>{state.renameRequests.push({...request});const entry=state.entries.find(entry=>entry.id===request.id);if(entry)entry.name=request.name;return success({entry})};
const drop=async({id})=>{state.entries=state.entries.filter(entry=>entry.id!==id);return success({})};
const setActive=async({id})=>{state.switches++;for(const entry of state.entries)entry.active=entry.id===id;return success({})};
const sources=[{id:'codex',label:'默认目录 (~/.codex)',path:'/home/demo/.codex',default:true,available:true,status:'ready',email:'work@example.test'},{id:'other',label:'codex-personal',path:'/home/demo/.config/codex/profiles/personal-account-with-a-long-directory-name',available:true,status:'ready',email:'personal-account-with-a-deliberately-long-email-address@example.test'},{id:'expired',label:'Expired CLI account',path:'/home/demo/expired-account',available:false,status:'expired',email:'expired@example.test'},{id:'unavailable',label:'No usable authorization',path:'/home/demo/empty-auth-directory',available:false,status:'unavailable'}];
const accounts={list,rename,drop,setActive,sources:async request=>{state.scans++;state.sourceRequests.push({...request});await new Promise(r=>setTimeout(r,state.delay));return success({sources:request.directory?[{...sources[1],id:'directory',path:request.directory}]:sources,defaultSourceId:'codex',policy:'只读常用目录、浅层候选和字面 CODEX_HOME；不执行脚本、不全盘扫描。',scan:{elapsedMs:state.delay,checkedDirectories:42,timedOut:state.partial,truncated:state.partial,budgetMs:8000}})},import:async request=>{state.imports++;state.importRequests.push({...request});const entry={id:'33333333',name:request.name||'Imported account',email:'new@example.test',active:false,source:'cli',sourcePath:request.directory};state.entries.push(entry);return success({entry})}};
// Model the backend response only: real official-credential preservation is tested independently.
const pool={list,rename,drop,setActive,add:async request=>{state.addRequests.push({...request});if(config.keyConfigured!==false&&!state.entries.some(entry=>entry.active))state.entries.unshift({id:'official1',name:defaultName,active:true});const entry={id:'33333333',name:request.name||'New account',active:false,accountType:request.accountType||'personal'};state.entries.push(entry);return success({entry})}};
const quota={snapshot:async request=>{state.quotaRequests.push({...request});return success({status:'ok',fetchedAt:Date.now()/1000,snapshot:{email:'work@example.test',plan:'PRO',windows:[{kind:'weekly',usedPercent:39.410000000000004,resetAt:Date.now()/1000+86400*5}],credits:{balance:54288.913}}})},history:async request=>{state.historyRequests.push({...request});return success({points:[{ts:Date.now()/1000-3600,used:{weekly:5}},{ts:Date.now()/1000-1800,used:{weekly:7}},{ts:Date.now()/1000-10,used:{weekly:39.410000000000004}}]})}};
const searchLogin={list:async()=>success({entries:[{key:'llm-pi-ai/openai-codex',authorized:config.authorized!==false,inFlight:false}]})};
// Requests can be held/released explicitly: loading assertions never depend on a timer race.
const home='/home/demo';
const longName='a-directory-with-a-deliberately-long-name-that-must-not-widen-the-picker';
state.directoryPaths={home,codex:home+'/.codex',empty:home+'/empty-directory',deep:home+'/.config/codex/profiles/'+longName+'/workspaces/current-account'};
const directoryEntries=path=>path===state.directoryPaths.empty?[]:[
  ...(path===home?[{name:'.codex',path:state.directoryPaths.codex},{name:'empty-directory',path:state.directoryPaths.empty}]:[]),
  {name:longName,path:path+'/'+longName},
  ...Array.from({length:64},(_,index)=>({name:'workspace-'+String(index+1).padStart(2,'0'),path:path+'/workspace-'+String(index+1).padStart(2,'0')}))
];
state.releaseDirectories=()=>{state.directoryHold=false;for(const pending of [...state.directoryPending])pending.resolve()};
const workspace={listDirectory:async(requestedPath,signal)=>{
  const path=requestedPath||state.directoryStartPath||home;
  const fail=state.directoryFailNext;state.directoryFailNext=false;
  state.directoryRequests.push({requestedPath:requestedPath??null,path});
  if(state.directoryHold)await new Promise((resolve,reject)=>{
    const finish=callback=>{state.directoryPending=state.directoryPending.filter(item=>item!==pending);signal?.removeEventListener('abort',abort);callback()};
    const abort=()=>{state.directoryAborts++;finish(()=>reject(new DOMException('Synthetic request cancelled','AbortError')))};
    const pending={path,resolve:()=>finish(resolve)};
    state.directoryPending.push(pending);
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  });
  if(fail)throw new Error('Synthetic directory access failure; retry is safe');
  const parts=path.split('/').filter(Boolean);
  return {path,home,crumbs:[{name:'/',path:'/'},...parts.map((name,index)=>({name,path:'/'+parts.slice(0,index+1).join('/')}))],entries:directoryEntries(path),truncated:path!==state.directoryPaths.empty};
}};
const primitives={SettingsForm:()=>null,SettingsFormModel:class{bind(){return {}}shell(){return {}}field(){return {}}actions(){return {}}dispose(){}}};
const plugin=registered.factory(id=>id==='react'?React:primitives);
const slots={inject:(_name,cb)=>cb(),register:(seat,cb)=>{if(seat.name==='settings.models.provider-card')Card=cb;if(seat.name==='settings.models.provider-actions')Actions=cb}};
const inject=(_deps,cb)=>{cb({uiWorkspace:workspace,remote:{searchLogin,quota,keyPool:pool,codexAccounts:accounts},slots});return Object.assign(Promise.resolve(),{dispose:async()=>{}})};
await plugin.apply({locale:{register:(ns,data)=>{dictionaries[ns]=data},bind:ns=>(key,params)=>{const s=dictionaries[ns]?.[window.fixtureLocale||'zh']?.[key]||key;return s.replace(/\\{(\\w+)\\}/g,(m,k)=>params?.[k]??m)}},effect:cb=>cb(),slots,configForms:{get:()=>({}),whileServed:()=>()=>{}},remote:{$mount:async()=>()=>{}},inject});
const provider={provider:config.provider||'openai-codex',settingsNs:'llm-pi-ai'};
createRoot(document.getElementById('root')).render(React.createElement('article',null,React.createElement('header',null,React.createElement('strong',null,provider.provider),React.createElement(Actions,{provider})),React.createElement(Card,{provider,keyConfigured:config.keyConfigured!==false})));
`
const bundle = await build({ stdin: { contents: fixture, resolveDir: tools, loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'browser' })
const css = `:root{--dsw-alias-label-primary:#17181b;--dsw-alias-label-secondary:#55595f;--dsw-alias-label-tertiary:#777d85;--dsw-alias-label-primary-foreground:white;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#fff;--dsw-alias-border-l3:#dddfe3;--dsw-alias-border-l4:#c9cdd3;--dsw-alias-interactive-bg-hover:#f3f4f6;--dsw-alias-brand-primary:#181a1e;--dsw-alias-button-primary-fill:#181a1e;--dsw-alias-button-primary-hover:#333;--dsw-alias-state-success-primary:#259c66;--dsw-alias-state-error-primary:#c33}body{font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;padding:16px;color:var(--dsw-alias-label-primary)}article{max-width:1100px;margin:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:16px;padding:16px}header{display:flex;align-items:center;justify-content:space-between;gap:8px}button,input{font:inherit}body.dark{background:#111216;--dsw-alias-label-primary:#e5e7eb;--dsw-alias-label-secondary:#b6bbc4;--dsw-alias-label-tertiary:#9299a5;--dsw-alias-label-primary-foreground:#121316;--dsw-alias-bg-layer-1:#1b1d22;--dsw-alias-bg-layer-2:#25282e;--dsw-alias-border-l3:#383c45;--dsw-alias-border-l4:#4c535e;--dsw-alias-interactive-bg-hover:#292c33;--dsw-alias-brand-primary:#e5e7eb;--dsw-alias-button-primary-fill:#e5e7eb;--dsw-alias-button-primary-hover:#fff}@media(max-width:480px){body{padding:8px}article{padding:12px}}`
// Host-level wrapping rules reproduce the badge failure even on wide pages.
// Font pressure is opt-in so the baseline geometry still reflects real UI sizing.
const pressureCss = `#root{overflow-wrap:anywhere;word-break:break-word}body.font-pressure{font-size:20px}body.font-pressure .provider-hub-ui .ph-account-name{font-size:18px}body.font-pressure .provider-hub-ui .ph-source-status{font-size:16px}`
const scenarios = [360, 390, 1009, 1040].flatMap(width => ['zh', 'en'].map(locale => ({ width, locale, key: `${width}-${locale}` })))
const longAccountName = 'Research / 研发账号 — a deliberately very long account name that must remain readable without widening the toolbar'

async function fixturePage(browser, scenario, config = {}) {
  const page = await browser.newPage({ viewport: { width: scenario.width, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent(`<style>${css}\n${pressureCss}</style><main id="root"></main>`)
  await page.evaluate(({ locale, config }) => { window.fixtureLocale = locale; window.fixtureConfig = config }, { locale: scenario.locale, config })
  await page.addScriptTag({ content: bundle.outputFiles[0].text, type: 'module' })
  await page.locator('[data-provider-pool-action]').click()
  return { page, errors }
}

async function quotaPresentation(page) {
  await page.locator('[data-quota-section][data-quota-state=ok]').waitFor()
  const usage = await page.locator('[data-quota-window] .ph-window-row').first().innerText()
  assert.match(usage, /39\.41%/, 'percentage rounds floating-point input to at most two decimals')
  assert.match(usage, /60\.59%/, 'remaining percentage is rounded independently')
  assert.doesNotMatch(usage, /\d+\.\d{3,}/, 'quota labels never expose floating-point tails')
  const lastPoint = page.locator('[data-quota-spark-hit]').last()
  await lastPoint.waitFor()
  await lastPoint.focus()
  const tooltip = page.locator('[data-quota-spark-tip]')
  await tooltip.waitFor()
  assert.doesNotMatch(await tooltip.innerText(), /\d+\.\d{3,}%/, 'history tooltips use the same percentage precision')
  await lastPoint.press('ArrowLeft')
  const tip = await tooltip.boundingBox()
  const width = page.viewportSize().width
  assert.ok(tip.x >= 0 && tip.x + tip.width <= width + 1, 'keyboard/touch tooltip stays inside the viewport')
  return usage
}

async function accountGeometry(page, kind) {
  const metrics = await page.evaluate(kind => {
    const bar = document.querySelector(kind === 'pool' ? '[data-pool-bar]' : '[data-codex-bar]')
    const trigger = document.querySelector(kind === 'pool' ? '[data-pool-add-trigger]' : '[data-codex-add]')
    const summary = bar.querySelector('[data-account-single], [data-' + kind + '-select]')
    const rect = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height, right: x + width, bottom: y + height } }
    return { overflow: document.documentElement.scrollWidth > innerWidth, width: innerWidth, bar: rect(bar), trigger: rect(trigger), summary: summary ? rect(summary) : null, toolbar: trigger.closest('.ph-pool-toolbar')?.parentElement === bar, names: [...bar.querySelectorAll('.ph-account-name')].map(node => ({ text: node.textContent, ...rect(node), ellipsis: getComputedStyle(node).textOverflow })) }
  }, kind)
  assert.equal(metrics.overflow, false, 'account controls do not widen the viewport: ' + JSON.stringify(metrics))
  assert.equal(metrics.toolbar, true, 'both add triggers share .ph-pool-toolbar beside selection or summary')
  for (const [name, rect] of Object.entries({ trigger: metrics.trigger, summary: metrics.summary })) {
    if (!rect) continue
    assert.ok(rect.x >= -1 && rect.right <= metrics.width + 1, `${name} stays within the viewport: ${JSON.stringify(metrics)}`)
    assert.ok(rect.width > 0 && rect.height > 0, `${name} remains visible`)
  }
  if (metrics.summary) {
    const overlapX = Math.min(metrics.summary.right, metrics.trigger.right) - Math.max(metrics.summary.x, metrics.trigger.x)
    const overlapY = Math.min(metrics.summary.bottom, metrics.trigger.bottom) - Math.max(metrics.summary.y, metrics.trigger.y)
    assert.ok(overlapX <= 1 || overlapY <= 1, 'add trigger never overlaps the account summary/picker: ' + JSON.stringify(metrics))
  }
  for (const name of metrics.names) {
    assert.ok(name.text.trim(), 'accounts always expose a meaningful name')
    assert.ok(name.width > 0 && name.height > 0, 'long account name must not collapse to an invisible box: ' + JSON.stringify(name))
    assert.ok(name.x >= -1 && name.right <= metrics.width + 1, 'long account names stay inside the viewport: ' + JSON.stringify(name))
  }
  return metrics
}

async function addPanelGeometry(page, kind) {
  const metrics = await page.evaluate(kind => {
    const panel = document.querySelector(kind === 'pool' ? '[data-pool-add-panel]' : '[data-codex-add-panel]')
    const bar = document.querySelector(kind === 'pool' ? '[data-pool-bar]' : '[data-codex-bar]')
    const quota = document.querySelector('[data-quota-section]')
    return { sharedClass: panel.classList.contains('ph-add-panel'), afterBar: !!(bar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING), aboveQuota: !quota || panel.getBoundingClientRect().bottom <= quota.getBoundingClientRect().top + 1, overflow: document.documentElement.scrollWidth > innerWidth }
  }, kind)
  assert.equal(metrics.sharedClass, true, 'API Key and Codex use the same add panel styling')
  assert.equal(metrics.afterBar, true, 'add panel follows the account toolbar')
  assert.equal(metrics.aboveQuota, true, 'add panel appears before quota rather than below it')
  assert.equal(metrics.overflow, false, 'expanded add panel stays in the viewport')
  return metrics
}

async function sourceBadgeGeometry(page, expected) {
  const metrics = await page.locator('[data-codex-source-status]').evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node)
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    const style = getComputedStyle(node)
    const bounds = node.getBoundingClientRect()
    const details = node.closest('[data-codex-source-details]')
    return { text: node.textContent.trim(), lines: new Set(rects.map(rect => Math.round(rect.top))).size, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, wordBreak: style.wordBreak, width: bounds.width, height: bounds.height, right: bounds.right, viewport: innerWidth, ancestorWrap: getComputedStyle(document.getElementById('root')).overflowWrap, explanation: [...details.querySelectorAll(':scope > p')].map(node => node.textContent.trim()) }
  })
  if (expected) assert.match(metrics.text, expected, 'badge uses the short status label')
  assert.equal(metrics.lines, 1, 'status badge must occupy one text line: ' + JSON.stringify(metrics))
  assert.equal(metrics.whiteSpace, 'nowrap', 'badge explicitly resists inherited arbitrary wrapping')
  assert.equal(metrics.ancestorWrap, 'anywhere', 'fixture applies realistic host overflow-wrap pressure')
  assert.ok(metrics.right <= metrics.viewport + 1, 'short status badge remains within the viewport')
  assert.ok(metrics.text.length <= 24, 'long expired/unavailable explanations are not placed inside the badge')
  return metrics
}

async function themedGeometry(page, scenario, kind, label, { badge = false } = {}) {
  const results = []
  for (const dark of [false, true]) {
    for (const pressure of [false, true]) {
      await page.evaluate(({ dark, pressure }) => { document.body.classList.toggle('dark', dark); document.body.classList.toggle('font-pressure', pressure) }, { dark, pressure })
      const account = await accountGeometry(page, kind)
      const source = badge ? await sourceBadgeGeometry(page) : undefined
      await page.screenshot({ path: join(output, `${label}-${scenario.key}-${dark ? 'dark' : 'light'}${pressure ? '-font-pressure' : ''}.png`), fullPage: true })
      results.push({ dark, pressure, account, ...(source ? { source } : {}) })
    }
  }
  await page.evaluate(() => document.body.classList.remove('dark', 'font-pressure'))
  return results
}

// Check the rendered foreground against the actual composited background, not
// merely a token value. Transparent buttons must inherit their ancestors' fill.
async function directoryPresentation(page, { many = true } = {}) {
  const metrics = await page.evaluate(() => {
    const manual = document.querySelector('details[data-codex-manual-path]')
    const browser = manual.querySelector('.ph-directory-browser')
    const list = browser.querySelector('.ph-directory-list')
    const nav = browser.querySelector('nav.ph-directory-crumbs')
    const rows = [...browser.querySelectorAll('button.ph-directory-entry')]
    const rgba = color => {
      const srgb = color.match(/^color\(srgb\s+(.+)\)$/)
      const channels = srgb?.[1] || color.match(/^rgba?\(([^)]+)\)$/)?.[1]
      const values = channels?.replaceAll(',', ' ').replace('/', ' ').trim().split(/\s+/).map(Number)
      if (!values || values.some(value => !Number.isFinite(value))) throw new Error('Unsupported computed color: ' + color)
      return [...values.slice(0, 3).map(value => srgb ? value * 255 : value), values[3] ?? 1]
    }
    const over = (foreground, background) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3]))
    const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    const tokenColor = token => {
      const probe = document.createElement('span')
      probe.style.color = 'var(' + token + ')'
      manual.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }
    const primary = tokenColor('--dsw-alias-label-primary')
    const tertiary = tokenColor('--dsw-alias-label-tertiary')
    const contrast = node => {
      const ancestors = []
      for (let element = node; element; element = element.parentElement) ancestors.unshift(element)
      let background = [255, 255, 255]
      let opacity = 1
      for (const element of ancestors) {
        const style = getComputedStyle(element)
        background = over(rgba(style.backgroundColor), background)
        opacity *= Number(style.opacity)
      }
      const color = getComputedStyle(node).color
      const foreground = over(rgba(color), background)
      const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      return { text: (node.textContent || node.getAttribute('name') || '').trim().slice(0, 80), color, background, opacity, ratio: (levels[0] + .05) / (levels[1] + .05) }
    }
    const controls = [...manual.querySelectorAll(':scope > summary, .ph-manual-body input, .ph-manual-body button:not(:disabled), .ph-manual-body .ph-answer-label > span, [data-directory-path], .ph-directory-feedback')]
    const names = rows.map(row => row.querySelector('.ph-account-name'))
    const navRect = nav?.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    return {
      primary, tertiary,
      mutedInheritance: !!manual.closest('.ph-muted'),
      manualBody: !!manual.querySelector('.ph-manual-body [data-codex-directory]') && !!manual.querySelector('.ph-manual-body [data-codex-action=browse]'),
      footer: !!browser.querySelector('.ph-directory-footer [data-directory-action=select]') && !!browser.querySelector('.ph-directory-footer [data-directory-action=cancel]'),
      rows: rows.length,
      folderSvgs: rows.filter(row => row.querySelector('svg')).length,
      names: names.filter(Boolean).map(contrast),
      controls: controls.map(contrast),
      nav: nav ? { height: navRect.height, width: navRect.width, current: nav.querySelectorAll('button[aria-current=page]').length, currentPath: nav.querySelector('button[aria-current=page]')?.title, maxButtonHeight: Math.max(...[...nav.querySelectorAll('button')].map(button => button.getBoundingClientRect().height)) } : null,
      path: browser.querySelector('[data-directory-path]')?.textContent,
      listHeight: listRect.height,
      listMaxHeight: getComputedStyle(list).maxHeight,
      listScrolls: list.scrollHeight > list.clientHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      listOverflow: list.scrollWidth > list.clientWidth,
    }
  })
  assert.equal(metrics.mutedInheritance, false, 'manual disclosure must not inherit ph-muted')
  assert.equal(metrics.manualBody, true, 'manual body groups the path form and browse action')
  assert.equal(metrics.footer, true, 'directory actions belong to a distinct footer')
  assert.ok(metrics.rows >= (many ? 60 : 1), 'fixture exercises a populated directory list')
  assert.equal(metrics.folderSvgs, metrics.rows, 'every directory row has a folder SVG')
  assert.equal(metrics.names.length, metrics.rows, 'every row has a directory name')
  for (const name of metrics.names) assert.equal(name.color, metrics.primary, 'directory names use primary foreground: ' + JSON.stringify(name))
  for (const item of [...metrics.names, ...metrics.controls]) {
    assert.notEqual(item.color, metrics.tertiary, 'normal controls must not look disabled: ' + JSON.stringify(item))
    assert.equal(item.opacity, 1, 'enabled text must not be dimmed: ' + JSON.stringify(item))
    assert.ok(item.ratio >= 4.5, 'rendered text contrast must be >=4.5: ' + JSON.stringify(item))
  }
  assert.ok(metrics.nav, 'breadcrumbs use nav.ph-directory-crumbs')
  assert.equal(metrics.nav.current, 1, 'exactly one breadcrumb marks the current directory')
  assert.equal(metrics.nav.currentPath, metrics.path, 'current breadcrumb matches the visible directory')
  assert.ok(metrics.nav.height <= 72 && metrics.nav.maxButtonHeight <= 40, 'breadcrumbs stay compact: ' + JSON.stringify(metrics.nav))
  assert.ok(metrics.listHeight <= 230 && metrics.listMaxHeight !== 'none', 'directory list is bounded: ' + JSON.stringify({ height: metrics.listHeight, maxHeight: metrics.listMaxHeight }))
  if (many) assert.equal(metrics.listScrolls, true, 'many directories scroll inside the bounded list')
  assert.equal(metrics.overflow, false, 'manual picker stays inside the viewport')
  assert.equal(metrics.listOverflow, false, 'long directory names do not cause horizontal list overflow')
  return { rows: metrics.rows, listHeight: metrics.listHeight, breadcrumbHeight: metrics.nav.height, minContrast: Math.min(...[...metrics.names, ...metrics.controls].map(item => item.ratio)), primary: metrics.primary, overflow: metrics.overflow }
}

async function directoryBusy(page, { hasView = false } = {}) {
  const browser = page.locator('.ph-directory-browser')
  await page.locator('[data-directory-loading]').waitFor()
  assert.equal(await browser.getAttribute('aria-busy'), 'true', 'directory browser announces pending navigation')
  assert.equal(await page.locator('[data-directory-loading]').evaluate(node => node.getAttribute('role') === 'status' || node.getAttribute('aria-live') === 'polite'), true, 'directory loading is announced as a status')
  assert.equal(await page.locator('[data-directory-loading] .ph-spinner').isVisible(), true, 'pending workspace requests show a visible busy indicator')
  assert.equal(await page.locator('[data-directory-action=select]').isDisabled(), true, 'cannot select a stale or unloaded directory')
  assert.equal(await page.locator('[data-directory-action=cancel]').isEnabled(), true, 'cancel remains available during navigation')
  if (hasView) assert.equal(await browser.locator('.ph-directory-entry, .ph-directory-crumbs button').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => node.disabled)), true, 'navigation controls are disabled while loading')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'busy directory picker stays in the viewport')
}

async function exerciseDirectoryPicker(page, scenario) {
  const manual = page.locator('details[data-codex-manual-path]')
  const browse = manual.locator('[data-codex-action=browse]')
  const directory = manual.locator('[name=directory]')
  const paths = await page.evaluate(() => window.fixture.directoryPaths)
  const before = await page.evaluate(() => ({ scans: window.fixture.scans, path: document.querySelector('[name=directory]').value }))
  await manual.locator('summary').first().click()
  assert.equal(await manual.getAttribute('open'), '', 'manual picker is opt-in through its disclosure')

  // Cancelling an initial pending navigation must not start an auth scan.
  await page.evaluate(() => { window.fixture.directoryHold = true })
  await browse.click()
  await directoryBusy(page)
  await page.screenshot({ path: join(output, `directory-loading-${scenario.key}.png`), fullPage: true })
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-directory-browser')), true, 'opening the browser moves keyboard focus inside')
  await page.keyboard.press('Escape')
  await page.locator('.ph-directory-browser').waitFor({ state: 'detached' })
  assert.equal(await browse.evaluate(node => node === document.activeElement), true, 'Escape restores focus to the browse trigger')
  assert.equal(await directory.inputValue(), before.path, 'cancel does not change the manual path')
  assert.equal(await page.evaluate(() => window.fixture.scans), before.scans, 'opening/cancelling directory browsing never scans auth')
  assert.equal(await page.evaluate(() => window.fixture.directoryPending.length), 0, 'cancel aborts the pending workspace request')
  assert.equal(await page.evaluate(() => window.fixture.directoryAborts), 1)

  await browse.click()
  await directoryBusy(page)
  await page.evaluate(() => window.fixture.releaseDirectories())
  await page.locator('.ph-directory-entry').first().waitFor()
  await page.locator('[data-directory-loading]').waitFor({ state: 'detached' })
  await page.screenshot({ path: join(output, `directory-picker-${scenario.key}.png`), fullPage: true })
  const light = await directoryPresentation(page)
  assert.match(await page.locator('.ph-directory-browser').innerText(), /仅显示部分结果|Only some directories are shown/i, 'large fixture exposes the truncated-directory notice')
  await page.evaluate(() => document.body.classList.add('dark'))
  await page.screenshot({ path: join(output, `directory-picker-dark-${scenario.key}.png`), fullPage: true })
  const dark = await directoryPresentation(page)
  await page.evaluate(() => document.body.classList.remove('dark'))

  // Existing rows must not look like active navigation while their successor loads.
  await page.evaluate(() => { window.fixture.directoryHold = true })
  await page.locator(`[data-directory-entry="${paths.codex}"]`).click()
  await directoryBusy(page, { hasView: true })
  await page.evaluate(() => window.fixture.releaseDirectories())
  await page.waitForFunction(path => document.querySelector('[data-directory-path]')?.textContent === path && !document.querySelector('[data-directory-loading]'), paths.codex)
  await page.locator('[data-directory-action=cancel]').click()
  await page.locator('.ph-directory-browser').waitFor({ state: 'detached' })
  assert.equal(await directory.inputValue(), before.path, 'cancelling after navigation also leaves the path unchanged')
  assert.equal(await page.evaluate(() => window.fixture.scans), before.scans)

  // No previous view exists on this failure; retry must also work from that state.
  await page.evaluate(() => { window.fixture.directoryFailNext = true })
  await browse.click()
  await page.locator('[data-directory-error]').waitFor()
  assert.match(await page.locator('[data-directory-error]').innerText(), /Synthetic directory access failure/)
  assert.equal(await page.locator('[data-directory-loading]').count(), 0, 'failed navigation clears loading')
  assert.equal(await page.locator('[data-directory-action=select]').isDisabled(), true)
  await page.screenshot({ path: join(output, `directory-error-${scenario.key}.png`), fullPage: true })
  const retry = page.locator('.ph-directory-footer [data-directory-action=retry]')
  assert.equal(await retry.count(), 1, 'directory errors expose an explicit retry')
  const requestsBeforeRetry = await page.evaluate(() => window.fixture.directoryRequests.length)
  await page.evaluate(() => { window.fixture.directoryHold = true })
  await retry.click()
  await directoryBusy(page)
  await page.evaluate(() => window.fixture.releaseDirectories())
  await page.locator('.ph-directory-entry').first().waitFor()
  await page.locator('[data-directory-error]').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => window.fixture.directoryRequests.length), requestsBeforeRetry + 1)

  await page.locator(`[data-directory-entry="${paths.empty}"]`).click()
  await page.locator('[data-directory-empty]').waitFor()
  assert.equal(await page.locator('[data-directory-empty]').getAttribute('role'), 'status', 'empty directories expose an explicit status')
  assert.equal(await page.locator('.ph-directory-entry').count(), 0, 'empty directories have no fake rows')
  assert.equal(await page.locator('[data-directory-action=select]').isEnabled(), true, 'an empty directory is still selectable')
  assert.equal(await page.locator('[data-directory-path]').innerText(), paths.empty)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: join(output, `directory-empty-${scenario.key}.png`), fullPage: true })
  await page.locator(`nav.ph-directory-crumbs button[title="${paths.home}"]`).click()
  await page.locator('.ph-directory-entry').first().waitFor()
  assert.equal(await page.locator('[data-directory-empty]').count(), 0, 'parent navigation leaves the empty state')
  assert.equal(await page.locator('[data-directory-path]').innerText(), paths.home)

  // Retry a failed child, not merely the last successfully displayed parent.
  await page.evaluate(() => { window.fixture.directoryFailNext = true })
  await page.locator(`[data-directory-entry="${paths.codex}"]`).click()
  await page.locator('[data-directory-error]').waitFor()
  assert.equal(await page.locator('[data-directory-path]').innerText(), paths.home, 'failed navigation preserves the known parent')
  await page.screenshot({ path: join(output, `directory-navigation-error-${scenario.key}.png`), fullPage: true })
  await page.evaluate(() => { window.fixture.directoryHold = true })
  await retry.click()
  await directoryBusy(page, { hasView: true })
  assert.equal(await page.evaluate(() => window.fixture.directoryRequests.at(-1).requestedPath), paths.codex, 'retry repeats the failed destination rather than refreshing the parent')
  await page.evaluate(() => window.fixture.releaseDirectories())
  await page.waitForFunction(path => document.querySelector('[data-directory-path]')?.textContent === path && !document.querySelector('[data-directory-loading]'), paths.codex)
  assert.equal(await page.locator('[data-directory-error]').count(), 0)
  await page.locator('[data-directory-action=cancel]').click()

  // Very deep paths and long crumb/row labels reproduce narrow-screen pressure.
  await page.evaluate(() => { window.fixture.directoryStartPath = window.fixture.directoryPaths.deep })
  await browse.click()
  await page.waitForFunction(path => document.querySelector('[data-directory-path]')?.textContent === path && !document.querySelector('[data-directory-loading]'), paths.deep)
  await page.screenshot({ path: join(output, `directory-deep-${scenario.key}.png`), fullPage: true })
  const deep = await directoryPresentation(page)
  await page.evaluate(() => document.body.classList.add('dark'))
  await page.screenshot({ path: join(output, `directory-deep-dark-${scenario.key}.png`), fullPage: true })
  const deepDark = await directoryPresentation(page)
  await page.evaluate(() => document.body.classList.remove('dark'))
  assert.equal(await page.evaluate(() => window.fixture.scans), before.scans, 'navigation alone never inspects auth files')
  await page.evaluate(() => { window.fixture.delay = 150 })
  await page.locator('[data-directory-action=select]').click()
  await page.locator('.ph-directory-browser').waitFor({ state: 'detached' })
  await page.locator('[data-codex-scan-status=done]').waitFor()
  assert.equal(await directory.inputValue(), paths.deep, 'selection fills the manual directory form')
  assert.deepEqual(await page.evaluate(() => window.fixture.sourceRequests.at(-1)), { directory: paths.deep }, 'only the selected directory is sent to auth-file inspection')
  assert.equal(await page.evaluate(() => window.fixture.scans), before.scans + 1, 'selection starts exactly one directory check')
  assert.equal(await page.locator('[data-codex-source-path]').innerText(), paths.deep)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'selected long path stays within the viewport')
  return { light, dark, deep, deepDark, selectedPath: paths.deep, requests: await page.evaluate(() => window.fixture.directoryRequests.length) }
}

async function renameSingle(page, kind, id) {
  const renamed = 'Renamed / 已重命名 — ' + longAccountName
  await page.locator(`[data-account-single=${kind}] [data-account-rename="${id}"]`).click()
  const form = page.locator(`[data-${kind}-rename="${id}"]`)
  await form.locator('[name=name]').fill(renamed)
  await form.locator('[data-account-edit=save]').click()
  await form.waitFor({ state: 'detached' })
  await page.waitForFunction(({ kind, renamed }) => document.querySelector('[data-account-single=' + kind + '] .ph-account-name')?.textContent === renamed, { kind, renamed })
  assert.deepEqual(await page.evaluate(() => window.fixture.renameRequests.at(-1)), { id, name: renamed }, 'single account supports real inline rename without a fake picker')
  return renamed
}

async function exercisePool(browser, scenario, mode) {
  const initialEntries = mode === 'single' ? [{ id: '11111111', name: longAccountName, active: true }] : []
  const { page, errors } = await fixturePage(browser, scenario, { provider: 'zai', entries: initialEntries, keyConfigured: mode !== 'empty' })
  const trigger = page.locator('[data-pool-add-trigger]')
  await trigger.waitFor()
  await page.waitForFunction(() => window.fixture.listRequests > 0)
  assert.equal(await page.locator('[data-pool-add-panel]').count(), 0, 'API Key add form starts collapsed')
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  let oldName = mode === 'default' ? scenario.locale === 'en' ? 'Default account' : '默认账号' : longAccountName
  if (mode === 'empty') {
    await page.locator('[data-pool-empty]').waitFor()
    assert.equal(await page.locator('[data-account-single=pool], [data-pool-select]').count(), 0, 'no key and no pool never invent an authorized default account')
    assert.equal(await page.locator('[data-quota-section]').count(), 0, 'empty unauthorized pool does not request official quota')
    assert.equal(await page.evaluate(() => window.fixture.quotaRequests.length), 0)
  } else {
    await page.locator('.ph-single-account[data-account-single=pool]').waitFor()
    assert.equal(await page.locator('[data-pool-select]').count(), 0, 'one account is a summary, not a one-option picker')
    assert.equal(await page.locator('[data-account-single=pool] .ph-account-name').innerText(), oldName)
    await quotaPresentation(page)
    const request = await page.evaluate(() => window.fixture.quotaRequests.at(-1))
    assert.equal(request.keyId, mode === 'default' ? undefined : '11111111', 'virtual default uses official quota, real single uses its key id')
    if (mode === 'single') oldName = await renameSingle(page, 'pool', '11111111')
  }
  const before = await themedGeometry(page, scenario, 'pool', `pool-${mode}`)
  await trigger.click()
  const form = page.locator('form[data-pool-add]')
  await form.waitFor()
  await page.waitForFunction(() => document.activeElement === document.querySelector('[data-pool-add] [name=name]'))
  await form.locator('[name=name]').fill('Discardable draft')
  const panel = await addPanelGeometry(page, 'pool')
  await page.locator('[data-pool-add-close]').click()
  await page.locator('[data-pool-add-panel]').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-pool-add-trigger'))
  await trigger.click()
  const newName = 'New API account / 新增账号'
  await form.locator('[name=name]').fill(newName)
  await form.locator('[name=value]').fill('synthetic-browser-fixture-not-a-credential')
  const save = form.locator('[data-pool-action=add]')
  assert.equal(await save.innerText(), scenario.locale === 'en' ? 'Save account' : '保存账号', 'saving is not ambiguously named like the expand trigger')
  assert.notEqual(await save.innerText(), (await trigger.innerText()).replace(/^＋\s*/, ''))
  const expanded = await themedGeometry(page, scenario, 'pool', `pool-${mode}-add`)
  await save.click()
  await page.locator('[data-pool-add-panel]').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-pool-add-trigger'))
  await page.waitForFunction(() => window.fixture.quotaRequests.at(-1)?.keyId === '33333333')
  assert.equal(await page.evaluate(() => window.fixture.switches), 0, 'save only previews the new account; it never calls setActive')
  const entries = await page.evaluate(() => window.fixture.entries)
  assert.equal(entries.length, mode === 'empty' ? 1 : 2, 'fixture models preservation of the old official/real account')
  assert.equal(entries.find(entry => entry.id === '33333333').name, newName)
  if (mode !== 'empty') {
    assert.equal(entries.find(entry => entry.active)?.name, mode === 'default' ? '默认账号' : oldName, 'adding preserves the backend-owned default/custom name and active account')
    assert.equal(await page.locator('[data-account-single=pool]').count(), 0)
    assert.equal(await page.locator('[data-pool-select]').getAttribute('data-selected-id'), '33333333', 'single/default transitions to a picker and previews the added key')
    await page.locator('[data-pool-select]').click()
    const choices = await page.locator('[data-account-list=pool] .ph-account-choice').allTextContents()
    assert.ok(choices.some(text => text.includes(oldName)), 'old default/account remains visible in the picker')
    assert.ok(choices.some(text => text.includes(newName)), 'new account has the submitted name')
    const oldId = mode === 'default' ? 'official1' : '11111111'
    await page.locator(`[data-pool-option="${oldId}"]`).click()
    await page.waitForFunction(id => window.fixture.quotaRequests.at(-1)?.keyId === id, oldId)
    assert.equal(await page.evaluate(() => window.fixture.switches), 0, 'returning to the old preview also does not switch credentials')
  } else {
    await page.locator('.ph-single-account[data-account-single=pool]').waitFor()
    assert.equal(await page.locator('[data-account-single=pool] .ph-account-name').innerText(), newName)
  }
  await trigger.click()
  assert.equal(await form.locator('[name=name]').inputValue(), '', 'successful save clears the account name')
  assert.equal(await form.locator('[name=value]').inputValue(), '', 'successful save clears the synthetic secret')
  await page.locator('[data-pool-add-close]').click()
  const after = await themedGeometry(page, scenario, 'pool', `pool-${mode}-saved`)
  assert.deepEqual(errors, [])
  await page.close()
  return { mode, before, panel, expanded, after, entries, browserErrors: errors.length }
}

async function exerciseCodexSingle(browser, scenario) {
  const { page, errors } = await fixturePage(browser, scenario, { entries: [{ id: '11111111', name: longAccountName, email: 'work@example.test', active: true, source: 'cli' }] })
  await page.locator('.ph-single-account[data-account-single=codex]').waitFor()
  assert.equal(await page.locator('[data-codex-select]').count(), 0)
  await quotaPresentation(page)
  const oldName = await renameSingle(page, 'codex', '11111111')
  const before = await themedGeometry(page, scenario, 'codex', 'codex-single')
  await page.locator('[data-codex-add]').click()
  await page.locator('[name=accountName]').fill('Second Codex account')
  await page.locator('[data-codex-add-method=cli]').click()
  await page.locator('[data-codex-scan-status=done]').waitFor()
  assert.equal(await page.locator('[data-codex-source-select]').count(), 1, 'source picker keeps its existing interaction even when the account is single')
  const panel = await addPanelGeometry(page, 'codex')
  await page.locator('[data-codex-action=import]').click()
  await page.locator('[data-codex-add-panel]').waitFor({ state: 'detached' })
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-codex-add'))
  await page.waitForFunction(() => window.fixture.quotaRequests.at(-1)?.grantId === '33333333')
  assert.equal(await page.locator('[data-codex-select]').getAttribute('data-selected-id'), '33333333')
  assert.equal(await page.locator('[data-account-single=codex]').count(), 0, 'import changes a single summary to the real multi-account picker')
  const entries = await page.evaluate(() => window.fixture.entries)
  assert.equal(entries.length, 2)
  assert.equal(entries.find(entry => entry.active)?.name, oldName)
  assert.equal(await page.evaluate(() => window.fixture.switches), 0)
  await page.locator('[data-codex-add]').click()
  assert.equal(await page.locator('[name=accountName]').inputValue(), '', 'successful import clears the shared name')
  await page.locator('[data-codex-add-close]').click()
  const after = await themedGeometry(page, scenario, 'codex', 'codex-single-saved')
  assert.deepEqual(errors, [])
  await page.close()
  return { before, panel, after, entries, browserErrors: errors.length }
}

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
const results = []
try {
  for (const scenario of scenarios) {
    console.log(`Running account layout acceptance: ${scenario.key}`)
    const { page, errors } = await fixturePage(browser, scenario)
    await page.locator('[data-codex-select]').waitFor()
    assert.equal(await page.evaluate(() => window.fixture.scans), 0, 'opening a quota preview never scans')
    const usage = await quotaPresentation(page)
    await page.locator('[data-codex-select]').click()
    await page.locator('[data-codex-option="22222222"]').click()
    const accountsGeometry = await themedGeometry(page, scenario, 'codex', 'accounts-long-name')
    assert.equal(await page.evaluate(() => window.fixture.switches), 0, 'selecting a long-named preview never activates it')
    await page.locator('[data-codex-add]').click()
    const name = page.locator('[name=accountName]')
    const start = page.locator('[data-login-action=start]')
    await start.waitFor()
    const geometry = await page.evaluate(() => {
      const label = document.querySelector('[name=accountName]').parentElement.getBoundingClientRect()
      const input = document.querySelector('[name=accountName]').getBoundingClientRect()
      const action = document.querySelector('[data-login-action=start]').getBoundingClientRect()
      const add = document.querySelector('[data-codex-add-panel]').getBoundingClientRect()
      const quota = document.querySelector('[data-quota-section]').getBoundingClientRect()
      return { labelHeight: label.height, gap: action.top - input.bottom, panelHeight: add.height, aboveQuota: add.bottom <= quota.top, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    assert.ok(geometry.labelHeight < 100, JSON.stringify(geometry))
    assert.ok(geometry.gap < 110, JSON.stringify(geometry))
    assert.ok(geometry.panelHeight < 340, JSON.stringify(geometry))
    assert.ok(geometry.aboveQuota, 'add form belongs beside selection, before quota')
    assert.equal(geometry.overflow, false)
    assert.equal(await page.evaluate(() => window.fixture.scans), 0, 'web login never scans')
    await page.waitForFunction(() => document.activeElement === document.querySelector('[name=accountName]'))
    const addGeometry = await addPanelGeometry(page, 'codex')
    await page.screenshot({ path: join(output, `add-web-${scenario.key}.png`), fullPage: true })
    await name.fill('A new account')
    await page.locator('[data-codex-add-method=cli]').click()
    await page.locator('[data-codex-scan-status=scanning]').waitFor()
    assert.equal(await page.locator('[data-codex-action=rescan]').isDisabled(), true)
    await page.locator('[data-codex-scan-status=done]').waitFor()
    await page.screenshot({ path: join(output, `import-cli-${scenario.key}.png`), fullPage: true })
    const sourceStatuses = []
    for (const [id, expected] of [['codex', /^(可导入|Ready to import)$/], ['expired', /^(已过期|Expired)$/], ['unavailable', /^(不可用|Unavailable)$/], ['other', /^(可导入|Ready to import)$/]]) {
      await page.locator('[data-codex-source-select]').click()
      await page.locator(`[data-codex-source-option=${id}]`).click()
      const badge = await sourceBadgeGeometry(page, expected)
      if (id === 'expired' || id === 'unavailable') {
        assert.ok(badge.explanation.some(text => text.length > badge.text.length), 'expired/unavailable explanation lives in a separate paragraph')
      }
      const themes = await themedGeometry(page, scenario, 'codex', `source-${id}`, { badge: true })
      sourceStatuses.push({ id, badge, themes })
    }
    await page.locator('[data-codex-source-details] summary').click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'long expanded paths stay in viewport')
    await page.evaluate(() => { window.fixture.partial = true; window.fixture.delay = 1200 })
    await page.locator('[data-codex-action=rescan]').click()
    await page.locator('[data-codex-scan-status=scanning]').waitFor()
    await page.screenshot({ path: join(output, `scanning-${scenario.key}.png`), fullPage: true })
    await page.locator('[data-codex-scan-status=done]').waitFor()
    assert.match(await page.locator('[data-codex-scan-status]').innerText(), /时间预算|Time budget/)
    const picker = await exerciseDirectoryPicker(page, scenario)
    await page.locator('[data-codex-action=import]').click()
    await page.locator('[data-codex-add-panel]').waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-codex-add'))
    assert.equal(await page.evaluate(() => window.fixture.switches), 0, 'import never activates an account')
    assert.deepEqual(await page.evaluate(() => window.fixture.importRequests.at(-1)), { directory: picker.selectedPath, name: 'A new account' }, 'import uses the chosen directory and shared account name')
    await page.waitForFunction(() => window.fixture.quotaRequests.at(-1)?.grantId === '33333333')
    assert.equal(await page.locator('[data-codex-select]').getAttribute('data-selected-id'), '33333333', 'successful import previews the newly named account')
    assert.equal(await page.evaluate(() => window.fixture.entries.find(entry => entry.active)?.id), '11111111', 'import preserves the current real account')
    await page.locator('[data-codex-add]').click()
    assert.equal(await name.inputValue(), '', 'successful import clears the shared account name')
    await page.locator('[data-codex-add-close]').click()
    await page.evaluate(() => document.body.classList.add('dark'))
    await page.screenshot({ path: join(output, `accounts-dark-${scenario.key}.png`), fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
    const pool = []
    for (const mode of ['default', 'single', 'empty']) pool.push(await exercisePool(browser, scenario, mode))
    const codexSingle = await exerciseCodexSingle(browser, scenario)
    results.push({ ...scenario, usage, ...geometry, addGeometry, accountsGeometry, sourceStatuses, directoryPicker: picker, pool, codexSingle, browserErrors: errors.length })
    await writeFile(join(output, 'layout-results.json'), JSON.stringify({ fixtureOnly: true, completedScenarios: results.length, results }, null, 2) + '\n')
  }
} catch (error) {
  const pages = browser.contexts().flatMap(context => context.pages())
  const failures = []
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: join(output, `layout-failure-${index}.png`), fullPage: true }).catch(() => {})
    failures.push(await page.evaluate(() => ({ text: document.body.innerText, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, focus: document.activeElement?.outerHTML, quotaRequests: window.fixture?.quotaRequests, entries: window.fixture?.entries })).catch(() => null))
  }
  await writeFile(join(output, 'layout-failure.json'), JSON.stringify({ message: error.message, stack: error.stack, completedScenarios: results.length, failures }, null, 2) + '\n')
  throw error
} finally { await browser.close() }
await writeFile(join(output, 'layout-results.json'), JSON.stringify({ fixtureOnly: true, completedScenarios: results.length, results }, null, 2) + '\n')
console.log(JSON.stringify({ fixtureOnly: true, results, screenshots: pathToFileURL(output).href }, null, 2))
