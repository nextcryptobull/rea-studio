#!/usr/bin/env bash
# Smoke test for REA Studio — exercises the full HTTP surface without a browser.
#
# Usage:
#   ./scripts/smoke-test.sh [BASE_URL]
#
# Defaults to http://localhost:3000. Run `bun run dev` first in another shell.
#
# Exits non-zero if any step fails. Designed for CI — keep it fast (<10s).

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0

section() { printf "\n\033[1;36m── %s ──\033[0m\n" "$1"; }
ok()      { printf "  \033[0;32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
fail()    { printf "  \033[0;31m✗\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }
req()     { printf "  \033[0;2m→\033[0m %s\n" "$1"; }

section "Health"
req "GET $BASE_URL/api/readiness"
READY=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/readiness")
CODE=$(echo "$READY" | tail -1)
BODY=$(echo "$READY" | sed '$d')
if [ "$CODE" = "200" ]; then
  ok "readiness endpoint returned 200"
  echo "$BODY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(f'    installed={d[\"installed\"]} version={d.get(\"version\")}')" 2>/dev/null || true
else
  fail "readiness endpoint returned $CODE"
fi

section "Create website job"
req "POST $BASE_URL/api/jobs  (targetType=website, target=https://example.com)"
JOB_RESP=$(curl -s -X POST "$BASE_URL/api/jobs" \
  -H 'content-type: application/json' \
  -d '{"targetType":"website","target":"https://example.com","label":"smoke test"}')
JOB_ID=$(echo "$JOB_RESP" | python3 -c "import json,sys;print(json.load(sys.stdin)['job']['id'])" 2>/dev/null || echo "")
if [ -n "$JOB_ID" ]; then
  ok "created job: $JOB_ID"
else
  fail "could not create job: $JOB_RESP"
  exit 1
fi

section "Start job"
req "POST $BASE_URL/api/jobs/$JOB_ID/start"
curl -s -X POST "$BASE_URL/api/jobs/$JOB_ID/start" > /dev/null
ok "start signal sent"

section "Wait for completion (max 30s)"
for i in $(seq 1 30); do
  sleep 1
  STATUS=$(curl -s "$BASE_URL/api/jobs/$JOB_ID" | python3 -c "import json,sys;print(json.load(sys.stdin)['job']['status'])" 2>/dev/null || echo "error")
  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
    break
  fi
done
if [ "$STATUS" = "done" ]; then
  ok "job reached 'done' in ${i}s"
else
  fail "job ended with status=$STATUS after ${i}s"
fi

section "Verify findings + log"
DETAIL=$(curl -s "$BASE_URL/api/jobs/$JOB_ID")
FINDING_COUNT=$(echo "$DETAIL" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['findings']))" 2>/dev/null || echo "0")
LOG_LEN=$(echo "$DETAIL" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['log']))" 2>/dev/null || echo "0")
if [ "$FINDING_COUNT" -ge 1 ]; then
  ok "findings recorded: $FINDING_COUNT"
else
  fail "expected at least 1 finding, got $FINDING_COUNT"
fi
if [ "$LOG_LEN" -ge 10 ]; then
  ok "log buffer non-empty: $LOG_LEN bytes"
else
  fail "log buffer suspiciously small: $LOG_LEN bytes"
fi

section "Generate retailored report"
req "POST $BASE_URL/api/jobs/$JOB_ID/reports  (audience=developer)"
REPORT_RESP=$(curl -s -X POST "$BASE_URL/api/jobs/$JOB_ID/reports" \
  -H 'content-type: application/json' \
  -d '{"audience":"developer"}')
REPORT_LEN=$(echo "$REPORT_RESP" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['report']['content']))" 2>/dev/null || echo "0")
if [ "$REPORT_LEN" -ge 100 ]; then
  ok "report generated: $REPORT_LEN chars"
else
  fail "report generation failed: $REPORT_RESP"
fi

section "Settings round-trip"
req "POST $BASE_URL/api/settings  (smoke_key=smoke_value)"
curl -s -X POST "$BASE_URL/api/settings" \
  -H 'content-type: application/json' \
  -d '{"smoke_key":"smoke_value"}' > /dev/null
SAVED=$(curl -s "$BASE_URL/api/settings" | python3 -c "import json,sys;print(json.load(sys.stdin)['settings'].get('smoke_key',''))" 2>/dev/null || echo "")
if [ "$SAVED" = "smoke_value" ]; then
  ok "settings persisted"
  # Clean up
  curl -s -X POST "$BASE_URL/api/settings" \
    -H 'content-type: application/json' \
    -d '{"smoke_key":""}' > /dev/null
else
  fail "settings did not persist (got '$SAVED')"
fi

section "Cleanup"
req "DELETE $BASE_URL/api/jobs/$JOB_ID"
curl -s -X DELETE "$BASE_URL/api/jobs/$JOB_ID" > /dev/null
ok "job deleted"

section "Summary"
printf "\n  \033[0;32m%d passed\033[0m, \033[0;31m%d failed\033[0m\n\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
