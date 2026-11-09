/// <reference path="../../pb_data/types.d.ts" />

/** Throws a 400 error in PocketBase's standard `{ data: { field: { code, message } } }` format. */
function fieldError(field, code, message) {
  const data = {}
  data[field] = new ValidationError(code, message)
  throw new BadRequestError('Failed to validate the submitted data.', data)
}

module.exports = { fieldError }
