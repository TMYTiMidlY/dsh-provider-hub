import { stringCodec, objectCodec, recordCodec, resultCodec } from './codecs.js'

export const TYPERT_REMOTE = {
  package: 'dsh-provider-hub',
  descriptors: [
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
  { id: 'dsh-provider-hub#keyPool/list', service: 'keyPool', namespace: 'keyPool', method: 'list', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-list-request') }], result: resultCodec('keyPool-list') },
  { id: 'dsh-provider-hub#keyPool/add', service: 'keyPool', namespace: 'keyPool', method: 'add', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-add-request') }], result: resultCodec('keyPool-add') },
  { id: 'dsh-provider-hub#keyPool/drop', service: 'keyPool', namespace: 'keyPool', method: 'drop', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-drop-request') }], result: resultCodec('keyPool-drop') },
  { id: 'dsh-provider-hub#keyPool/rename', service: 'keyPool', namespace: 'keyPool', method: 'rename', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-rename-request') }], result: resultCodec('keyPool-rename') },
  { id: 'dsh-provider-hub#keyPool/setActive', service: 'keyPool', namespace: 'keyPool', method: 'setActive', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('keyPool-setActive-request') }], result: resultCodec('keyPool-setActive') },
    { id: 'dsh-provider-hub#codexAccounts/list', service: 'codexAccounts', namespace: 'codexAccounts', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: resultCodec('codexAccounts-list') },
    { id: 'dsh-provider-hub#codexAccounts/sources', service: 'codexAccounts', namespace: 'codexAccounts', method: 'sources', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-sources-request') }], result: resultCodec('codexAccounts-sources') },
    { id: 'dsh-provider-hub#codexAccounts/import', service: 'codexAccounts', namespace: 'codexAccounts', method: 'import', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-import-request') }], result: resultCodec('codexAccounts-import') },
    { id: 'dsh-provider-hub#codexAccounts/drop', service: 'codexAccounts', namespace: 'codexAccounts', method: 'drop', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-drop-request') }], result: resultCodec('codexAccounts-drop') },
    { id: 'dsh-provider-hub#codexAccounts/rename', service: 'codexAccounts', namespace: 'codexAccounts', method: 'rename', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-rename-request') }], result: resultCodec('codexAccounts-rename') },
    { id: 'dsh-provider-hub#codexAccounts/setActive', service: 'codexAccounts', namespace: 'codexAccounts', method: 'setActive', invocation: { kind: 'direct' }, parameters: [{ name: 'request', wire: 'request', source: 'json', codec: recordCodec('codexAccounts-setActive-request') }], result: resultCodec('codexAccounts-setActive') },
  ],
}
export default TYPERT_REMOTE
