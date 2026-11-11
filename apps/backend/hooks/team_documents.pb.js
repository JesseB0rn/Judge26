/// <reference path="../pb_data/types.d.ts" />

// Team documents (M1-13): the server records who uploaded a document.

onRecordCreateRequest((e) => {
  const auth = e.auth
  e.record.set('uploaded_by', auth && !auth.isSuperuser() ? auth.id : '')
  e.next()
}, 'team_documents')
