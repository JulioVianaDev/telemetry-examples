# Backend API - Curl Examples

Base URL: `http://localhost:3333`

## Health Check

```bash
curl http://localhost:3333/
```

## Create Message

```bash
curl -X POST http://localhost:3333/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from curl"}'
```

### Send multiple messages (load test)

```bash
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3333/messages \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"Message $i\"}"
  echo
done
```

### Validation error (empty content)

```bash
curl -X POST http://localhost:3333/messages \
  -H "Content-Type: application/json" \
  -d '{"content": ""}'
```

### Validation error (missing field)

```bash
curl -X POST http://localhost:3333/messages \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Expected Responses

### GET /

```
Hello World!
```

### POST /messages (success)

```json
{
  "id": "uuid-generated",
  "content": "Hello from curl",
  "status": "pending",
  "createdAt": "2026-04-28T..."
}
```

### POST /messages (validation error)

```json
{
  "statusCode": 400,
  "message": ["content should not be empty"],
  "error": "Bad Request"
}
```
