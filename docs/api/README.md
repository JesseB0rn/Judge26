# API

The backend is PocketBase. Collection CRUD endpoints follow the
[PocketBase Web API](https://pocketbase.io/docs/api-records/); access is controlled by each
collection's API rules (defined in migrations).

## Caching

API responses must never be cached; see [M3 spec](../specifications/M3-rounds-and-ranking.md#caching).

## Error format

All errors use PocketBase's format:

```json
{
  "status": 400,
  "message": "Failed to create record.",
  "data": {
    "key": { "code": "validation_required", "message": "Cannot be blank." }
  }
}
```

## Custom endpoints

| Method | Path            | Auth   | Description                                             |
| ------ | --------------- | ------ | ------------------------------------------------------- |
| GET    | `/api/health`   | public | PocketBase health check (built-in)                      |
| GET    | `/api/app/info` | public | `{ name, environment }`; verifies that hooks are loaded |

## Collections

| Collection     | Purpose                          | Access             | Migration                           |
| -------------- | -------------------------------- | ------------------ | ----------------------------------- |
| `users`        | Built-in auth collection         | PocketBase default | –                                   |
| `app_settings` | Platform-wide key/value settings | superusers only    | `1762700000_create_app_settings.js` |
