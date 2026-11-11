/// <reference path="../../pb_data/types.d.ts" />

// Optimistic concurrency for record API updates (M4-14-19, M5, M7-T10).

/**
 * Continues an update request (`e.next()`) only if the stored record still has the `updated`
 * value the client based its change on (`expected_updated`), otherwise refuses it with 409.
 * Check and save run in one transaction: the database has a single writer, so a second request
 * based on the same version waits and then sees the newer version instead of overwriting it.
 * Requests for which `applies(body)` is false are not checked.
 */
function versionedUpdate(e, applies, message) {
  const body = e.requestInfo().body || {}
  if (!applies(body)) return e.next()
  const collection = e.record.collection().name
  e.app.runInTransaction((tx) => {
    const stored = tx.findRecordById(collection, e.record.id)
    if (body.expected_updated !== stored.getString('updated')) {
      throw new ApiError(409, message, {
        _error: new ValidationError('changed_meanwhile', message),
      })
    }
    e.app = tx
    e.next()
  })
}

module.exports = { versionedUpdate }
