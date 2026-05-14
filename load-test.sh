#!/bin/bash
# Load Test Script - Hits all CRUD endpoints to generate telemetry data
# Usage: bash load-test.sh [NUM_MESSAGES]

BASE_URL="http://localhost:3333"
NUM=${1:-20}
IDS=()

echo "========================================="
echo "  Load Test - $NUM messages"
echo "========================================="

# --- Health Check ---
echo ""
echo "[1/7] Health Check"
curl -s "$BASE_URL/"
echo ""

# --- Create Messages ---
echo ""
echo "[2/7] Creating $NUM messages..."
for i in $(seq 1 "$NUM"); do
  RESPONSE=$(curl -s -X POST "$BASE_URL/messages" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"Load test message $i\"}")
  ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$ID" ]; then
    IDS+=("$ID")
    echo "  Created: $ID"
  else
    echo "  Error: $RESPONSE"
  fi
done
echo "  Total created: ${#IDS[@]}"

# small pause so consumer can process some
sleep 2

# --- List Messages (various queries) ---
echo ""
echo "[3/7] Listing messages with different queries..."

echo "  GET /messages (default)"
curl -s "$BASE_URL/messages" | head -c 200
echo ""

echo "  GET /messages?limit=5&offset=0"
curl -s "$BASE_URL/messages?limit=5&offset=0" | head -c 200
echo ""

echo "  GET /messages?limit=3&offset=2"
curl -s "$BASE_URL/messages?limit=3&offset=2" | head -c 200
echo ""

echo "  GET /messages?status=pending"
curl -s "$BASE_URL/messages?status=pending" | head -c 200
echo ""

echo "  GET /messages?status=processed"
curl -s "$BASE_URL/messages?status=processed" | head -c 200
echo ""

echo "  GET /messages?content=Load"
curl -s "$BASE_URL/messages?content=Load" | head -c 200
echo ""

echo "  GET /messages?status=processed&limit=3&offset=0"
curl -s "$BASE_URL/messages?status=processed&limit=3&offset=0" | head -c 200
echo ""

# --- Get Single Messages ---
echo ""
echo "[4/7] Getting individual messages..."
for i in $(seq 0 4); do
  if [ $i -lt ${#IDS[@]} ]; then
    echo "  GET /messages/${IDS[$i]}"
    curl -s "$BASE_URL/messages/${IDS[$i]}" | head -c 200
    echo ""
  fi
done

# --- Update Messages ---
echo ""
echo "[5/7] Updating messages..."
HALF=$((NUM / 2))
for i in $(seq 0 $((HALF - 1))); do
  if [ $i -lt ${#IDS[@]} ]; then
    echo "  PUT /messages/${IDS[$i]}"
    curl -s -X PUT "$BASE_URL/messages/${IDS[$i]}" \
      -H "Content-Type: application/json" \
      -d "{\"content\": \"Updated message $((i + 1))\"}" | head -c 200
    echo ""
  fi
done

# --- Trigger 500 Internal Server Errors ---
echo ""
echo "[6/8] Simulating 500 Internal Server Errors..."

ERRORS=("default" "null" "undefined" "timeout" "db" "oom" "type")
for err_type in "${ERRORS[@]}"; do
  echo "  GET /messages/test/error?type=$err_type (500)"
  curl -s "$BASE_URL/messages/test/error?type=$err_type" | head -c 300
  echo ""
done

# --- Trigger 4xx Errors (DTO validation, not found, invalid UUID) ---
echo ""
echo "[7/8] Triggering 4xx errors for telemetry..."

echo "  POST /messages - empty content (400)"
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -d '{"content": ""}' | head -c 300
echo ""

echo "  POST /messages - missing field (400)"
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -d '{}' | head -c 300
echo ""

echo "  GET /messages/:id - not found (404)"
curl -s "$BASE_URL/messages/00000000-0000-0000-0000-000000000000" | head -c 300
echo ""

echo "  GET /messages/:id - invalid UUID (400)"
curl -s "$BASE_URL/messages/not-a-uuid" | head -c 300
echo ""

echo "  PUT /messages/:id - not found (404)"
curl -s -X PUT "$BASE_URL/messages/00000000-0000-0000-0000-000000000000" \
  -H "Content-Type: application/json" \
  -d '{"content": "nope"}' | head -c 300
echo ""

echo "  PUT /messages/:id - empty content (400)"
if [ ${#IDS[@]} -gt 0 ]; then
  curl -s -X PUT "$BASE_URL/messages/${IDS[0]}" \
    -H "Content-Type: application/json" \
    -d '{"content": ""}' | head -c 300
  echo ""
fi

echo "  PUT /messages/:id - invalid UUID (400)"
curl -s -X PUT "$BASE_URL/messages/bad-uuid" \
  -H "Content-Type: application/json" \
  -d '{"content": "nope"}' | head -c 300
echo ""

echo "  DELETE /messages/:id - not found (404)"
curl -s -X DELETE "$BASE_URL/messages/00000000-0000-0000-0000-000000000000" | head -c 300
echo ""

echo "  DELETE /messages/:id - invalid UUID (400)"
curl -s -X DELETE "$BASE_URL/messages/bad-uuid" | head -c 300
echo ""

echo "  GET /messages?limit=-1 - invalid limit (400)"
curl -s "$BASE_URL/messages?limit=-1" | head -c 300
echo ""

echo "  GET /messages?limit=999 - limit too high (400)"
curl -s "$BASE_URL/messages?limit=999" | head -c 300
echo ""

echo "  POST /messages - extra field forbidden (400)"
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -d '{"content": "test", "hacker": true}' | head -c 300
echo ""

# --- Delete some Messages ---
echo ""
echo "[8/8] Deleting last 5 messages..."
START=$((${#IDS[@]} - 5))
if [ $START -lt 0 ]; then START=0; fi
for i in $(seq $START $((${#IDS[@]} - 1))); do
  echo "  DELETE /messages/${IDS[$i]}"
  curl -s -X DELETE "$BASE_URL/messages/${IDS[$i]}" | head -c 200
  echo ""
done

# --- Final listing ---
echo ""
echo "========================================="
echo "  Final state"
echo "========================================="
echo ""
curl -s "$BASE_URL/messages?limit=100"
echo ""
echo ""
echo "Done! Check your Grafana dashboard at http://localhost:5555"
