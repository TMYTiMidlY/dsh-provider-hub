const passthrough = () => ({ parse: value => value })
const stringCodec = (name) => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}`, create: passthrough })
const objectCodec = (name) => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}`, create: passthrough })
const resultCodec = (name) => ({ mode: 'strict', typeSymbol: `dsh-web-search#${name}:result`, create: passthrough })

const descriptors = [
  { id: 'dsh-web-search#searchLogin/list', service: 'searchLogin', namespace: 'searchLogin', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('list') },
  { id: 'dsh-web-search#searchLogin/start', service: 'searchLogin', namespace: 'searchLogin', method: 'start', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: objectCodec('start-request') }], result: resultCodec('start') },
  { id: 'dsh-web-search#searchLogin/status', service: 'searchLogin', namespace: 'searchLogin', method: 'status', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('status') },
  { id: 'dsh-web-search#searchLogin/answer', service: 'searchLogin', namespace: 'searchLogin', method: 'answer', invocation: { kind: 'direct' }, parameters: [
    { name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') },
    { name: 'value', wire: 'value', source: 'json', codec: stringCodec('value') },
  ], result: resultCodec('answer') },
  { id: 'dsh-web-search#searchLogin/cancel', service: 'searchLogin', namespace: 'searchLogin', method: 'cancel', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('cancel') },
]

export const TYPERT = {
  package: 'dsh-web-search',
  face: 'host',
  schemas: [],
  invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}
export default TYPERT
