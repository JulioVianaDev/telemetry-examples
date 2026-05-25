#!/bin/bash
# Load Test Script - Hits all CRUD endpoints to generate telemetry data
# Usage: bash load-test.sh [NUM_MESSAGES]

BASE_URL="http://localhost:3333"
NUM=${1:-20}
IDS=()

# Mock users with their tenant IDs (must match backend/src/users.mock.ts)
USER_IDS=("user-1" "user-2" "user-3" "user-4" "user-5")
TENANT_IDS=("tenant-acme" "tenant-acme" "tenant-globex" "tenant-globex" "tenant-initech")

echo "========================================="
echo "  Load Test - $NUM messages"
echo "========================================="

# --- Health Check ---
echo ""
echo "[1/7] Health Check"
curl -s "$BASE_URL/" -H "X-User-Id: user-1"
echo ""

# --- Create Messages ---
echo ""
echo "[2/7] Creating $NUM messages..."
for i in $(seq 1 "$NUM"); do
  IDX=$(( (i - 1) % ${#USER_IDS[@]} ))
  CUR_USER="${USER_IDS[$IDX]}"
  CUR_TENANT="${TENANT_IDS[$IDX]}"
  RESPONSE=$(curl -s -X POST "$BASE_URL/messages" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $CUR_USER" \
    -d "{\"content\": \"Load test message $i\", \"tenantId\": \"$CUR_TENANT\"}")
  ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$ID" ]; then
    IDS+=("$ID")
    echo "  Created: $ID (user=$CUR_USER tenant=$CUR_TENANT)"
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
curl -s "$BASE_URL/messages" -H "X-User-Id: user-1" | head -c 200
echo ""

echo "  GET /messages?limit=5&offset=0"
curl -s "$BASE_URL/messages?limit=5&offset=0" -H "X-User-Id: user-2" | head -c 200
echo ""

echo "  GET /messages?limit=3&offset=2"
curl -s "$BASE_URL/messages?limit=3&offset=2" -H "X-User-Id: user-3" | head -c 200
echo ""

echo "  GET /messages?status=pending"
curl -s "$BASE_URL/messages?status=pending" -H "X-User-Id: user-1" | head -c 200
echo ""

echo "  GET /messages?status=processed"
curl -s "$BASE_URL/messages?status=processed" -H "X-User-Id: user-4" | head -c 200
echo ""

echo "  GET /messages?content=Load"
curl -s "$BASE_URL/messages?content=Load" -H "X-User-Id: user-5" | head -c 200
echo ""

echo "  GET /messages?status=processed&limit=3&offset=0"
curl -s "$BASE_URL/messages?status=processed&limit=3&offset=0" -H "X-User-Id: user-1" | head -c 200
echo ""

# --- Get Single Messages ---
echo ""
echo "[4/7] Getting individual messages..."
for i in $(seq 0 4); do
  if [ $i -lt ${#IDS[@]} ]; then
    IDX=$(( i % ${#USER_IDS[@]} ))
    echo "  GET /messages/${IDS[$i]}"
    curl -s "$BASE_URL/messages/${IDS[$i]}" -H "X-User-Id: ${USER_IDS[$IDX]}" | head -c 200
    echo ""
  fi
done

# --- Update Messages ---
echo ""
echo "[5/7] Updating messages..."
HALF=$((NUM / 2))
for i in $(seq 0 $((HALF - 1))); do
  if [ $i -lt ${#IDS[@]} ]; then
    IDX=$(( i % ${#USER_IDS[@]} ))
    echo "  PUT /messages/${IDS[$i]}"
    curl -s -X PUT "$BASE_URL/messages/${IDS[$i]}" \
      -H "Content-Type: application/json" \
      -H "X-User-Id: ${USER_IDS[$IDX]}" \
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
  curl -s "$BASE_URL/messages/test/error?type=$err_type" -H "X-User-Id: user-1" | head -c 300
  echo ""
done

# --- Trigger 4xx Errors (DTO validation, not found, invalid UUID) ---
echo ""
echo "[7/8] Triggering 4xx errors for telemetry..."

echo "  POST /messages - empty content (400)"
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-1" \
  -d '{"content": "", "tenantId": "tenant-acme"}' | head -c 300
echo ""

echo "  POST /messages - missing field (400)"
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-1" \
  -d '{}' | head -c 300
echo ""

echo "  GET /messages/:id - not found (404)"
curl -s "$BASE_URL/messages/00000000-0000-0000-0000-000000000000" -H "X-User-Id: user-1" | head -c 300
echo ""

echo "  GET /messages/:id - invalid UUID (400)"
curl -s "$BASE_URL/messages/not-a-uuid" -H "X-User-Id: user-1" | head -c 300
echo ""

echo "  PUT /messages/:id - not found (404)"
curl -s -X PUT "$BASE_URL/messages/00000000-0000-0000-0000-000000000000" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-1" \
  -d '{"content": "nope"}' | head -c 300
echo ""

echo "  PUT /messages/:id - empty content (400)"
if [ ${#IDS[@]} -gt 0 ]; then
  curl -s -X PUT "$BASE_URL/messages/${IDS[0]}" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: user-1" \
    -d '{"content": ""}' | head -c 300
  echo ""
fi

echo "  PUT /messages/:id - invalid UUID (400)"
curl -s -X PUT "$BASE_URL/messages/bad-uuid" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-1" \
  -d '{"content": "nope"}' | head -c 300
echo ""

echo "  DELETE /messages/:id - not found (404)"
curl -s -X DELETE "$BASE_URL/messages/00000000-0000-0000-0000-000000000000" -H "X-User-Id: user-1" | head -c 300
echo ""

echo "  DELETE /messages/:id - invalid UUID (400)"
curl -s -X DELETE "$BASE_URL/messages/bad-uuid" -H "X-User-Id: user-1" | head -c 300
echo ""

echo "  GET /messages?limit=-1 - invalid limit (400)"
curl -s "$BASE_URL/messages?limit=-1" -H "X-User-Id: user-1" | head -c 300
echo ""

echo "  GET /messages?limit=999 - limit too high (400)"
curl -s "$BASE_URL/messages?limit=999" -H "X-User-Id: user-1" | head -c 300
echo ""

echo "  POST /messages - extra field forbidden (400)"
curl -s -X POST "$BASE_URL/messages" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: user-1" \
  -d '{"content": "test", "tenantId": "tenant-acme", "hacker": true}' | head -c 300
echo ""

# --- Delete some Messages ---
echo ""
echo "[8/8] Deleting last 5 messages..."
START=$((${#IDS[@]} - 5))
if [ $START -lt 0 ]; then START=0; fi
for i in $(seq $START $((${#IDS[@]} - 1))); do
  IDX=$(( i % ${#USER_IDS[@]} ))
  echo "  DELETE /messages/${IDS[$i]}"
  curl -s -X DELETE "$BASE_URL/messages/${IDS[$i]}" -H "X-User-Id: ${USER_IDS[$IDX]}" | head -c 200
  echo ""
done

# --- Final listing ---
echo ""
echo "========================================="
echo "  Final state"
echo "========================================="
echo ""
curl -s "$BASE_URL/messages?limit=100" -H "X-User-Id: user-1"
echo ""
echo ""

# --- Expected Counts Summary ---
HALF=$((NUM / 2))
GET_SINGLE=$(( NUM >= 5 ? 5 : NUM ))
DEL_COUNT=$(( NUM >= 5 ? 5 : NUM ))

# 4xx counts per endpoint (all use user-1 → tenant-acme):
#   POST /messages:       3  (empty content, missing field, extra field)
#   GET /messages:        2  (limit=-1, limit=999)
#   GET /messages/:id:    2  (invalid UUID 400 + not found 404)
#   PUT /messages/:id:    3  (not found 404 + empty content 400 + invalid UUID 400)
#   DELETE /messages/:id: 2  (not found 404 + invalid UUID 400)

POST_4XX=3
GET_LIST_4XX=2
GET_ONE_4XX=2
PUT_4XX=3
DEL_4XX=2
ERR_5XX=7

# --- Tenant distribution helper ---
# Users cycle: user-1(acme), user-2(acme), user-3(globex), user-4(globex), user-5(initech)
# Per cycle of 5: acme=2, globex=2, initech=1
distribute() {
  local c=$1
  local f=$((c / 5))
  local r=$((c % 5))
  DIST_A=$(( f * 2 + (r >= 1 ? 1 : 0) + (r >= 2 ? 1 : 0) ))
  DIST_G=$(( f * 2 + (r >= 3 ? 1 : 0) + (r >= 4 ? 1 : 0) ))
  DIST_I=$f
}

# POST /messages 2xx per tenant
distribute "$NUM"
POST_A=$DIST_A; POST_G=$DIST_G; POST_I=$DIST_I

# GET /messages 2xx per tenant (hardcoded from script — see user assignments)
#   user-1(acme): lines 52,64,76,208 = 4 | user-2(acme): line 56 = 1
#   user-3(globex): line 60 = 1 | user-4(globex): line 68 = 1
#   user-5(initech): line 72 = 1
GETL_A=5; GETL_G=2; GETL_I=1

# GET /messages/:id 2xx per tenant
distribute "$GET_SINGLE"
GETS_A=$DIST_A; GETS_G=$DIST_G; GETS_I=$DIST_I

# PUT /messages/:id 2xx per tenant
distribute "$HALF"
PUT_A=$DIST_A; PUT_G=$DIST_G; PUT_I=$DIST_I

# DELETE /messages/:id 2xx per tenant (last 5 always cycles all 5 positions)
distribute "$DEL_COUNT"
DEL_A=$DIST_A; DEL_G=$DIST_G; DEL_I=$DIST_I

# GET / health check: user-1 → acme only
HC_A=1; HC_G=0; HC_I=0

# 5xx errors: all use user-1 → acme only
ERR_A=7; ERR_G=0; ERR_I=0

# 4xx errors: all use user-1 → acme only
E4_A=$((POST_4XX + GET_LIST_4XX + GET_ONE_4XX + PUT_4XX + DEL_4XX))
E4_G=0; E4_I=0

# --- Per-tenant totals ---
ACME_2XX=$((HC_A + POST_A + GETL_A + GETS_A + PUT_A + DEL_A))
ACME_4XX=$E4_A
ACME_5XX=$ERR_A
ACME_TOTAL=$((ACME_2XX + ACME_4XX + ACME_5XX))

GLOBEX_2XX=$((HC_G + POST_G + GETL_G + GETS_G + PUT_G + DEL_G))
GLOBEX_4XX=$E4_G
GLOBEX_5XX=$ERR_G
GLOBEX_TOTAL=$((GLOBEX_2XX + GLOBEX_4XX + GLOBEX_5XX))

INITECH_2XX=$((HC_I + POST_I + GETL_I + GETS_I + PUT_I + DEL_I))
INITECH_4XX=$E4_I
INITECH_5XX=$ERR_I
INITECH_TOTAL=$((INITECH_2XX + INITECH_4XX + INITECH_5XX))

TOTAL_2XX=$((ACME_2XX + GLOBEX_2XX + INITECH_2XX))
TOTAL_4XX=$((ACME_4XX + GLOBEX_4XX + INITECH_4XX))
TOTAL_5XX=$((ACME_5XX + GLOBEX_5XX + INITECH_5XX))
TOTAL=$((TOTAL_2XX + TOTAL_4XX + TOTAL_5XX))

# ===================================================================
#  GLOBAL TABLE
# ===================================================================
echo "========================================="
echo "  EXPECTED COUNTS (compare with Grafana)"
echo "========================================="
echo ""
echo "  GLOBAL (Tenant = All)"
echo "  Endpoint                      | Total | 2xx | 4xx | 5xx"
echo "  ----------------------------------------------------------"
printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /"                    1                              1              0       0
printf "  %-30s | %5d | %3d | %3d | %3d\n" "POST /messages"           $((NUM + POST_4XX))            $NUM           $POST_4XX 0
printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /messages"            $((8 + GET_LIST_4XX))          8              $GET_LIST_4XX 0
printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /messages/:id"        $((GET_SINGLE + GET_ONE_4XX))  $GET_SINGLE    $GET_ONE_4XX 0
printf "  %-30s | %5d | %3d | %3d | %3d\n" "PUT /messages/:id"        $((HALF + PUT_4XX))            $HALF          $PUT_4XX 0
printf "  %-30s | %5d | %3d | %3d | %3d\n" "DELETE /messages/:id"     $((DEL_COUNT + DEL_4XX))       $DEL_COUNT     $DEL_4XX 0
printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /messages/test/error" $ERR_5XX                       0              0       $ERR_5XX
echo "  ----------------------------------------------------------"
printf "  %-30s | %5d | %3d | %3d | %3d\n" "TOTALS" $TOTAL $TOTAL_2XX $TOTAL_4XX $TOTAL_5XX

# ===================================================================
#  PER-TENANT TABLES
# ===================================================================

# --- Helper to print one tenant table ---
print_tenant_table() {
  local TNAME=$1
  local T_HC=$2;    local T_POST=$3;  local T_GETL=$4;  local T_GETS=$5
  local T_PUT=$6;   local T_DEL=$7;   local T_ERR5=$8;  local T_E4_POST=$9
  local T_E4_GETL=${10}; local T_E4_GETS=${11}; local T_E4_PUT=${12}; local T_E4_DEL=${13}

  local T2=$((T_HC + T_POST + T_GETL + T_GETS + T_PUT + T_DEL))
  local T4=$((T_E4_POST + T_E4_GETL + T_E4_GETS + T_E4_PUT + T_E4_DEL))
  local T5=$T_ERR5
  local TT=$((T2 + T4 + T5))

  echo ""
  echo "  TENANT: $TNAME"
  echo "  Endpoint                      | Total | 2xx | 4xx | 5xx"
  echo "  ----------------------------------------------------------"
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /"                    $((T_HC + 0))                                      $T_HC          0       0
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "POST /messages"           $((T_POST + T_E4_POST))        $T_POST        $T_E4_POST  0
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /messages"            $((T_GETL + T_E4_GETL))        $T_GETL        $T_E4_GETL  0
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /messages/:id"        $((T_GETS + T_E4_GETS))        $T_GETS        $T_E4_GETS  0
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "PUT /messages/:id"        $((T_PUT + T_E4_PUT))          $T_PUT         $T_E4_PUT   0
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "DELETE /messages/:id"     $((T_DEL + T_E4_DEL))          $T_DEL         $T_E4_DEL   0
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "GET /messages/test/error" $T_ERR5                        0              0       $T_ERR5
  echo "  ----------------------------------------------------------"
  printf "  %-30s | %5d | %3d | %3d | %3d\n" "TOTALS" $TT $T2 $T4 $T5
}

#                       HC     POST    GETL   GETS    PUT    DEL    5xx   4xx: POST GETL GETS PUT DEL
print_tenant_table "tenant-acme" \
                        $HC_A  $POST_A $GETL_A $GETS_A $PUT_A $DEL_A $ERR_A \
                        $POST_4XX $GET_LIST_4XX $GET_ONE_4XX $PUT_4XX $DEL_4XX

print_tenant_table "tenant-globex" \
                        $HC_G  $POST_G $GETL_G $GETS_G $PUT_G $DEL_G $ERR_G \
                        0 0 0 0 0

print_tenant_table "tenant-initech" \
                        $HC_I  $POST_I $GETL_I $GETS_I $PUT_I $DEL_I $ERR_I \
                        0 0 0 0 0

# ===================================================================
#  TENANT SUMMARY
# ===================================================================
echo ""
echo "  TENANT SUMMARY"
echo "  Tenant                        | Total | 2xx | 4xx | 5xx"
echo "  ----------------------------------------------------------"
printf "  %-30s | %5d | %3d | %3d | %3d\n" "tenant-acme"    $ACME_TOTAL    $ACME_2XX    $ACME_4XX    $ACME_5XX
printf "  %-30s | %5d | %3d | %3d | %3d\n" "tenant-globex"  $GLOBEX_TOTAL  $GLOBEX_2XX  $GLOBEX_4XX  $GLOBEX_5XX
printf "  %-30s | %5d | %3d | %3d | %3d\n" "tenant-initech" $INITECH_TOTAL $INITECH_2XX $INITECH_4XX $INITECH_5XX
echo "  ----------------------------------------------------------"
printf "  %-30s | %5d | %3d | %3d | %3d\n" "ALL TENANTS" $TOTAL $TOTAL_2XX $TOTAL_4XX $TOTAL_5XX

echo ""
echo "  Notes:"
echo "    - 2xx includes 200 and 201 (POST create returns 201)"
echo "    - All 4xx/5xx errors use user-1 (tenant-acme)"
echo "    - Users cycle: user-1,2(acme) → user-3,4(globex) → user-5(initech)"
echo "    - 4xx detail: POST=3, GET list=2, GET one=2, PUT=3, DELETE=2"
echo "    - 5xx detail: GET /messages/test/error x7 (all tenant-acme)"
echo ""
echo "Done! Check your Grafana dashboard at http://localhost:5555"
