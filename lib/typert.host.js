import { stringCodec, objectCodec, recordCodec, resultCodec } from './codecs.js'

const descriptors = [
  { id: 'dsh-provider-hub#searchLogin/list', service: 'searchLogin', namespace: 'searchLogin', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('list') },
  { id: 'dsh-provider-hub#searchLogin/start', service: 'searchLogin', namespace: 'searchLogin', method: 'start', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: objectCodec('start-request') }], result: resultCodec('start') },
  { id: 'dsh-provider-hub#searchLogin/status', service: 'searchLogin', namespace: 'searchLogin', method: 'status', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('status') },
  { id: 'dsh-provider-hub#searchLogin/answer', service: 'searchLogin', namespace: 'searchLogin', method: 'answer', invocation: { kind: 'direct' }, parameters: [
    { name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') },
    { name: 'value', wire: 'value', source: 'json', codec: stringCodec('value') },
  ], result: resultCodec('answer') },
  { id: 'dsh-provider-hub#searchLogin/cancel', service: 'searchLogin', namespace: 'searchLogin', method: 'cancel', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('cancel') },
  { id: 'dsh-provider-hub#quota/snapshot', service: 'quota', namespace: 'quota', method: 'snapshot', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('snapshot-request') }], result: resultCodec('snapshot') },
  { id: 'dsh-provider-hub#quota/history', service: 'quota', namespace: 'quota', method: 'history', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('history-request') }], result: resultCodec('history') },
]

export const TYPERT = {
  package: 'dsh-provider-hub',
  face: 'host',
  schemas: [],
  invocations: descriptors,
  model: { services: [], events: [], objects: [] },
}
export default TYPERT
