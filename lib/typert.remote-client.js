import { stringCodec, objectCodec, resultCodec } from './codecs.js'

export const TYPERT_REMOTE = {
  package: 'dsh-web-search',
  descriptors: [
    { id: 'dsh-web-search#searchLogin/list', service: 'searchLogin', namespace: 'searchLogin', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('list') },
    { id: 'dsh-web-search#searchLogin/start', service: 'searchLogin', namespace: 'searchLogin', method: 'start', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: objectCodec('start-request') }], result: resultCodec('start') },
    { id: 'dsh-web-search#searchLogin/status', service: 'searchLogin', namespace: 'searchLogin', method: 'status', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('status') },
    { id: 'dsh-web-search#searchLogin/answer', service: 'searchLogin', namespace: 'searchLogin', method: 'answer', invocation: { kind: 'direct' }, parameters: [
      { name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') },
      { name: 'value', wire: 'value', source: 'json', codec: stringCodec('value') },
    ], result: resultCodec('answer') },
    { id: 'dsh-web-search#searchLogin/cancel', service: 'searchLogin', namespace: 'searchLogin', method: 'cancel', invocation: { kind: 'direct' }, parameters: [{ name: 'attemptId', wire: 'attemptId', source: 'json', codec: stringCodec('attemptId') }], result: resultCodec('cancel') },
  ],
}
export default TYPERT_REMOTE
