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

### Validation error (extra field - forbidden)

```bash
curl -X POST http://localhost:3333/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "test", "hacker": true}'
```

## List Messages

### Get all (default: limit=10, offset=0)

```bash
curl http://localhost:3333/messages
```

### With pagination

```bash
curl "http://localhost:3333/messages?limit=5&offset=0"
```

### Filter by status

```bash
curl "http://localhost:3333/messages?status=pending"
curl "http://localhost:3333/messages?status=processed"
```

### Search by content

```bash
curl "http://localhost:3333/messages?content=Hello"
```

### Combined filters

```bash
curl "http://localhost:3333/messages?status=processed&content=Hello&limit=5&offset=0"
```

### Validation error (invalid limit)

```bash
curl "http://localhost:3333/messages?limit=-1"
curl "http://localhost:3333/messages?limit=999"
```

## Get Single Message

Replace the UUID below with a real one from POST or GET /messages:

```bash
curl http://localhost:3333/messages/your-uuid-here
```

### Not found error

```bash
curl http://localhost:3333/messages/00000000-0000-0000-0000-000000000000
```

### Invalid UUID error

```bash
curl http://localhost:3333/messages/not-a-uuid
```

## Update Message

Replace the UUID below with a real one:

```bash
curl -X PUT http://localhost:3333/messages/your-uuid-here \
  -H "Content-Type: application/json" \
  -d '{"content": "Updated content"}'
```

### Validation error (empty content)

```bash
curl -X PUT http://localhost:3333/messages/00000000-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"content": ""}'
```

## Delete Message

Replace the UUID below with a real one:

```bash
curl -X DELETE http://localhost:3333/messages/your-uuid-here
```

### Not found error

```bash
curl -X DELETE http://localhost:3333/messages/00000000-0000-0000-0000-000000000000
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
  "error": "DTO Validation Failed"
}
```

### GET /messages (success)

```json
{
  "data": [
    {
      "id": "uuid",
      "content": "Hello from curl",
      "status": "processed",
      "createdAt": "2026-04-28T..."
    }
  ],
  "count": 1
}
```

### GET /messages/:id (not found)

```json
{
  "statusCode": 404,
  "message": "Message 00000000-0000-0000-0000-000000000000 not found"
}
```

### PUT /messages/:id (success)

```json
{
  "id": "uuid",
  "content": "Updated content",
  "status": "pending",
  "createdAt": "2026-04-28T..."
}
```

### DELETE /messages/:id (success)

```json
{
  "deleted": true,
  "id": "uuid"
}
```

## Load Test Script

Run the automated load test to hit ALL endpoints (success + errors):

```bash
bash load-test.sh        # default 20 messages
bash load-test.sh 50     # custom count
```
