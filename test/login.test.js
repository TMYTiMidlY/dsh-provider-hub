import test from 'node:test'
import assert from 'node:assert/strict'
import { SearchLoginService } from '../lib/index.js'
import { stringCodec, objectCodec } from '../lib/codecs.js'
import { zaiSearch } from '../lib/search.js'
const settled = () => new Promise(resolve => setImmediate(resolve))
function bridge(authorization, credentials = {}) {
  const service=Object.create(SearchLoginService.prototype)
  Object.defineProperty(service,'ctx',{value:{authorization, credentials}})
  service.attempts=new Map()
  return service
}

test('cancelling an old attempt cannot abort the next attempt for the same key',async()=>{
  const signals=[]
  const service=bridge({describe:()=>({}),begin:request=>new Promise(resolve=>{
    signals.push(request.signal)
    request.signal.addEventListener('abort',()=>resolve({status:'cancelled'}),{once:true})
  }),cancel:()=>{throw new Error('Must not cancel by credential key')}})
  const a=service.start({key:'test/key'})
  assert.equal(service.start({key:'test/key'}).id,a.id,'remount returns owned live attempt')
  service.cancel(a.id); await settled()
  assert.equal(service.status(a.id).status,'cancelled')
  const b=service.start({key:'test/key'})
  service.cancel(a.id)
  assert.equal(signals[1].aborted,false)
  assert.equal(service.status(b.id).status,'running')
  service.cancel(b.id); await settled()
})

test('cancellation does not falsely report cancelled while an admitted commit wins',async()=>{
  let commit
  const service=bridge({describe:()=>({}),begin:()=>new Promise(resolve=>{commit=resolve})})
  const a=service.start({key:'test/key'})
  assert.equal(service.cancel(a.id).status,'running')
  commit({status:'authorized'}); await settled()
  assert.equal(service.status(a.id).status,'authorized')
})

test('logout withdraws its own key only and deletes the credential record',async()=>{
  const seamCancelled=[],deleted=[]
  const service=bridge({
    describe:key=>key==='test/mine'||key==='test/other'?{}:undefined,
    cancel:key=>seamCancelled.push(key),
    begin:request=>new Promise(resolve=>{
      request.signal.addEventListener('abort',()=>resolve({status:'cancelled'}),{once:true})
    }),
  },{deleteRecord:async key=>{deleted.push(key)}})
  const mine=service.start({key:'test/mine'})
  const other=service.start({key:'test/other'})
  const result=await service.logout('test/mine')
  await settled()
  assert.deepEqual(result,{key:'test/mine',status:'logged-out'})
  assert.deepEqual(seamCancelled,['test/mine'])
  assert.deepEqual(deleted,['test/mine'])
  assert.equal(service.status(mine.id).status,'cancelled')
  assert.equal(service.status(other.id).status,'running','a logout must not stop another key attempt')
  service.cancel(other.id); await settled()
})

test('logout rejects keys without a registered authorization flow',async()=>{
  const deleted=[]
  const service=bridge({describe:()=>undefined},{deleteRecord:async key=>{deleted.push(key)}})
  await assert.rejects(()=>service.logout('dsh-provider-hub/codex-account-abcd1234'),/no authorization flow is registered/)
  await assert.rejects(()=>service.logout('  '),/non-empty string/)
  assert.deepEqual(deleted,[])
})

test('select prompt preserves options and validates string answer',async()=>{
  const service=bridge({describe:()=>({}),begin:async request=>{
    await request.interaction.prompt({kind:'select',message:'Choose',options:[{id:'one',label:'One'}]})
    return {status:'authorized'}
  }})
  const a=service.start({key:'test/key'})
  assert.deepEqual(service.status(a.id).prompt.options,[{id:'one',label:'One'}])
  assert.throws(()=>service.answer(a.id,{}),/text/)
  assert.throws(()=>service.answer(a.id,'two'),/selection/)
  service.answer(a.id,'one'); await settled()
  assert.equal(service.status(a.id).status,'authorized')
})

test('failed OAuth attempt exposes a fixed public error without partial grant tokens or raw cause', async () => {
  const access = 'SYNTHETIC_ACCESS_SECRET_NEVER_RETURN'
  const refresh = 'SYNTHETIC_REFRESH_SECRET_NEVER_RETURN'
  const record = { key: 'test/key', label: 'Synthetic authorization', methods: [{ id: 'oauth', label: 'OAuth' }], inFlight: false }
  const service = bridge({
    describe: () => record,
    list: () => [record],
    begin: async () => { throw new Error(`Synthetic OAuth partial grant ${JSON.stringify({ access, refresh })}`) },
  }, { describeRecord: async () => ({ configured: false }) })
  const attempt = service.start({ key: 'test/key' })
  await settled()
  const status = service.status(attempt.id)
  const list = await service.list()
  assert.equal(status.status, 'failed')
  assert.equal(status.error, 'Account authorization failed; retry and check the authorization page or network connection')
  for (const result of [status, list]) {
    assert.doesNotMatch(JSON.stringify(result), new RegExp(`${access}|${refresh}|partial grant`, 'u'))
    assert.equal(Object.hasOwn(result, 'cause'), false)
    assert.equal(Object.hasOwn(result, 'rawError'), false)
  }
})

test('remote argument codecs reject invalid values rather than coercing them',()=>{
  assert.throws(()=>stringCodec('text').create().parse({}),/text/)
  assert.throws(()=>objectCodec('request').create().parse({key:123}),/request/)
  assert.deepEqual(objectCodec('request').create().parse({key:'test/key'}),{key:'test/key'})
})

test('ZAI searches resolve managed references even without an api-key record',async()=>{
  const ctx={credentials:{readRecord:async()=>undefined,resolve:async ref=>ref==='ZAI_API_KEY'?{value:'synthetic-key'}:undefined}}
  const result=await zaiSearch(ctx,'query',{fetch:async (_url,options)=>{
    assert.equal(options.headers.authorization,'Bearer synthetic-key')
    const request=JSON.parse(options.body)
    if(request.method==='notifications/initialized')return new Response(null,{status:202})
    return Response.json({jsonrpc:'2.0',id:request.id,result:request.method==='tools/call'?{content:[{type:'text',text:JSON.stringify([{title:'Result',link:'https://example.com'}])}]}:{}})
  }},new AbortController().signal)
  assert.equal(result.sources.length,1)
})
