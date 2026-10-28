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
const state=window.fixture={scans:0,imports:0,switches:0,partial:false,delay:600,sourceRequests:[],importRequests:[],directoryRequests:[],directoryPending:[],directoryAborts:0,directoryHold:false,directoryFailNext:false};
const entries=[{id:'11111111',name:'work@example.test',email:'work@example.test',active:true,source:'cli',sourcePath:'/home/demo/.codex'},{id:'22222222',name:'Personal account with a deliberately long display name',email:'personal@example.test',active:false,source:'web'}];
const sources=[{id:'codex',label:'默认目录 (~/.codex)',path:'/home/demo/.codex',default:true,available:true,status:'ready',email:'work@example.test'},{id:'other',label:'codex-personal',path:'/home/demo/.config/codex/profiles/personal-account-with-a-long-directory-name',available:true,status:'ready',email:'personal@example.test'}];
const accounts={list:async()=>({ok:true,value:{entries}}),sources:async request=>{state.scans++;state.sourceRequests.push({...request});await new Promise(r=>setTimeout(r,state.delay));return {ok:true,value:{sources:request.directory?[{...sources[1],id:'directory',path:request.directory}]:sources,defaultSourceId:'codex',policy:'只读常用目录、浅层候选和字面 CODEX_HOME；不执行脚本、不全盘扫描。',scan:{elapsedMs:state.delay,checkedDirectories:42,timedOut:state.partial,truncated:state.partial,budgetMs:8000}}}},import:async request=>{state.imports++;state.importRequests.push({...request});return {ok:true,value:{entry:{id:'22222222'}}}},rename:async()=>({ok:true,value:{}}),drop:async()=>({ok:true,value:{}}),setActive:async({id})=>{state.switches++;for(const entry of entries)entry.active=entry.id===id;return {ok:true,value:{}}}};
const quota={snapshot:async()=>({ok:true,value:{status:'ok',fetchedAt:Date.now()/1000,snapshot:{email:'work@example.test',plan:'PRO',windows:[{kind:'weekly',usedPercent:8,resetAt:Date.now()/1000+86400*5}],credits:{balance:54288.913}}}}),history:async()=>({ok:true,value:{points:[{ts:Date.now()/1000-3600,used:{weekly:5}},{ts:Date.now()/1000-1800,used:{weekly:7}},{ts:Date.now()/1000-10,used:{weekly:8}}]}})};
const searchLogin={list:async()=>({ok:true,value:{entries:[{key:'llm-pi-ai/openai-codex',authorized:true,inFlight:false}]}})};
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
const inject=(_deps,cb)=>{cb({uiWorkspace:workspace,remote:{searchLogin,quota,keyPool:{},codexAccounts:accounts},slots});return Object.assign(Promise.resolve(),{dispose:async()=>{}})};
await plugin.apply({locale:{register:(ns,data)=>{dictionaries[ns]=data},bind:ns=>(key,params)=>{const s=dictionaries[ns]?.[window.fixtureLocale||'zh']?.[key]||key;return s.replace(/\\{(\\w+)\\}/g,(m,k)=>params?.[k]??m)}},effect:cb=>cb(),slots,configForms:{get:()=>({}),whileServed:()=>()=>{}},remote:{$mount:async()=>()=>{}},inject});
const provider={provider:'openai-codex',settingsNs:'llm-pi-ai'};
createRoot(document.getElementById('root')).render(React.createElement('article',null,React.createElement('header',null,React.createElement('strong',null,'openai-codex'),React.createElement(Actions,{provider})),React.createElement(Card,{provider})));
`
const bundle = await build({ stdin: { contents: fixture, resolveDir: tools, loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'browser' })
const css = `:root{--dsw-alias-label-primary:#17181b;--dsw-alias-label-secondary:#55595f;--dsw-alias-label-tertiary:#777d85;--dsw-alias-label-primary-foreground:white;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#fff;--dsw-alias-border-l3:#dddfe3;--dsw-alias-border-l4:#c9cdd3;--dsw-alias-interactive-bg-hover:#f3f4f6;--dsw-alias-brand-primary:#181a1e;--dsw-alias-button-primary-fill:#181a1e;--dsw-alias-button-primary-hover:#333;--dsw-alias-state-success-primary:#259c66;--dsw-alias-state-error-primary:#c33}body{font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;padding:16px;color:var(--dsw-alias-label-primary)}article{max-width:860px;margin:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:16px;padding:16px}header{display:flex;align-items:center;justify-content:space-between;gap:8px}button,input{font:inherit}body.dark{background:#111216;--dsw-alias-label-primary:#e5e7eb;--dsw-alias-label-secondary:#b6bbc4;--dsw-alias-label-tertiary:#9299a5;--dsw-alias-label-primary-foreground:#121316;--dsw-alias-bg-layer-1:#1b1d22;--dsw-alias-bg-layer-2:#25282e;--dsw-alias-border-l3:#383c45;--dsw-alias-border-l4:#4c535e;--dsw-alias-interactive-bg-hover:#292c33;--dsw-alias-brand-primary:#e5e7eb;--dsw-alias-button-primary-fill:#e5e7eb;--dsw-alias-button-primary-hover:#fff}@media(max-width:480px){body{padding:8px}article{padding:12px}}`
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
  await page.screenshot({ path: join(output, `directory-loading-${scenario.width}.png`), fullPage: true })
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
  await page.screenshot({ path: join(output, `directory-picker-${scenario.width}.png`), fullPage: true })
  const light = await directoryPresentation(page)
  assert.match(await page.locator('.ph-directory-browser').innerText(), /仅显示部分结果|Only some directories are shown/i, 'large fixture exposes the truncated-directory notice')
  await page.evaluate(() => document.body.classList.add('dark'))
  await page.screenshot({ path: join(output, `directory-picker-dark-${scenario.width}.png`), fullPage: true })
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
  await page.screenshot({ path: join(output, `directory-error-${scenario.width}.png`), fullPage: true })
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
  await page.screenshot({ path: join(output, `directory-empty-${scenario.width}.png`), fullPage: true })
  await page.locator(`nav.ph-directory-crumbs button[title="${paths.home}"]`).click()
  await page.locator('.ph-directory-entry').first().waitFor()
  assert.equal(await page.locator('[data-directory-empty]').count(), 0, 'parent navigation leaves the empty state')
  assert.equal(await page.locator('[data-directory-path]').innerText(), paths.home)

  // Retry a failed child, not merely the last successfully displayed parent.
  await page.evaluate(() => { window.fixture.directoryFailNext = true })
  await page.locator(`[data-directory-entry="${paths.codex}"]`).click()
  await page.locator('[data-directory-error]').waitFor()
  assert.equal(await page.locator('[data-directory-path]').innerText(), paths.home, 'failed navigation preserves the known parent')
  await page.screenshot({ path: join(output, `directory-navigation-error-${scenario.width}.png`), fullPage: true })
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
  await page.screenshot({ path: join(output, `directory-deep-${scenario.width}.png`), fullPage: true })
  const deep = await directoryPresentation(page)
  await page.evaluate(() => document.body.classList.add('dark'))
  await page.screenshot({ path: join(output, `directory-deep-dark-${scenario.width}.png`), fullPage: true })
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

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
const results = []
try {
  for (const scenario of [{ width: 360, locale: 'zh' }, { width: 390, locale: 'zh' }, { width: 1009, locale: 'zh' }, { width: 1040, locale: 'en' }]) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: 1000 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent(`<style>${css}</style><main id="root"></main>`)
    await page.evaluate(locale => { window.fixtureLocale = locale }, scenario.locale)
    await page.addScriptTag({ content: bundle.outputFiles[0].text, type: 'module' })
    await page.locator('[data-provider-pool-action]').click()
    await page.locator('[data-codex-select]').waitFor()
    assert.equal(await page.evaluate(() => window.fixture.scans), 0, 'opening a quota preview never scans')
    await page.screenshot({ path: join(output, `accounts-${scenario.width}.png`), fullPage: true })
    const lastPoint = page.locator('[data-quota-spark-hit]').last()
    await lastPoint.focus()
    await lastPoint.press('ArrowLeft')
    await page.locator('[data-quota-spark-tip]').waitFor()
    const tip = await page.locator('[data-quota-spark-tip]').boundingBox()
    assert.ok(tip.x >= 0 && tip.x + tip.width <= scenario.width, 'keyboard/touch tooltip stays inside the viewport')
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
    await page.screenshot({ path: join(output, `add-web-${scenario.width}.png`), fullPage: true })
    await name.fill('A new account')
    await page.locator('[data-codex-add-method=cli]').click()
    await page.locator('[data-codex-scan-status=scanning]').waitFor()
    assert.equal(await page.locator('[data-codex-action=rescan]').isDisabled(), true)
    await page.locator('[data-codex-scan-status=done]').waitFor()
    await page.screenshot({ path: join(output, `import-cli-${scenario.width}.png`), fullPage: true })
    await page.locator('[data-codex-source-select]').click()
    await page.locator('[data-codex-source-option=other]').click()
    await page.locator('[data-codex-source-details] summary').click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'long expanded paths stay in viewport')
    await page.evaluate(() => { window.fixture.partial = true; window.fixture.delay = 1200 })
    await page.locator('[data-codex-action=rescan]').click()
    await page.locator('[data-codex-scan-status=scanning]').waitFor()
    await page.screenshot({ path: join(output, `scanning-${scenario.width}.png`), fullPage: true })
    await page.locator('[data-codex-scan-status=done]').waitFor()
    assert.match(await page.locator('[data-codex-scan-status]').innerText(), /时间预算|Time budget/)
    const picker = await exerciseDirectoryPicker(page, scenario)
    await page.locator('[data-codex-action=import]').click()
    await page.locator('[data-codex-add-panel]').waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-codex-add'))
    assert.equal(await page.evaluate(() => window.fixture.switches), 0, 'import never activates an account')
    assert.deepEqual(await page.evaluate(() => window.fixture.importRequests.at(-1)), { directory: picker.selectedPath, name: 'A new account' }, 'import uses the chosen directory and shared account name')
    await page.locator('[data-codex-add]').click()
    assert.equal(await name.inputValue(), '', 'successful import clears the shared account name')
    await page.locator('[data-codex-add-close]').click()
    await page.evaluate(() => document.body.classList.add('dark'))
    await page.screenshot({ path: join(output, `accounts-dark-${scenario.width}.png`), fullPage: true })
    assert.deepEqual(errors, [])
    results.push({ ...scenario, ...geometry, directoryPicker: picker, browserErrors: errors.length })
    await page.close()
  }
} finally { await browser.close() }
await writeFile(join(output, 'layout-results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify({ fixtureOnly: true, results, screenshots: pathToFileURL(output).href }, null, 2))
