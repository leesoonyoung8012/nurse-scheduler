#!/bin/bash
# 병동 수간호사 요청 감시 — launchd가 두 가지 모드로 실행한다.
#   alert  : 5분마다. 새 '오류신고'가 들어오면 즉시 맥 알림 (장애는 승인 대상이 아니라 복구 대상)
#   brief  : 매일 16:00. 미처리 요청을 모아 브리핑 파일 + 알림 (새 요청이 없으면 아무것도 안 함)
# 인증: 백업 전용 계정(backup-db.sh와 동일, 키체인 'nurse-duty-backup') — 읽기만 하고 DB에 쓰지 않는다.
set -euo pipefail

MODE="${1:-brief}"
API_KEY="AIzaSyB8NiNjOhhCTYiU9YBB66lBD9KDgA3yth8"   # 공개 클라이언트 식별자 (보호막은 DB 규칙)
DB_BASE="https://lsy-duty-f8012-default-rtdb.asia-southeast1.firebasedatabase.app"
ACCOUNT="db-backup@nurse.duty.local"
OUT_DIR="$HOME/NurseSchedulerRequests"      # ~/Desktop 아래에 두면 TCC로 조용히 실패한다
STATE="$OUT_DIR/.seen-$MODE"

log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
notify(){ osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true; }

mkdir -p "$OUT_DIR"

PW=$(security find-generic-password -s nurse-duty-backup -a "$ACCOUNT" -w 2>/dev/null) \
  || { log "오류: 키체인에서 계정 비밀번호를 찾지 못했습니다 (서비스명 nurse-duty-backup)"; exit 1; }

BODY=$(python3 -c "import json,sys;print(json.dumps({'email':sys.argv[1],'password':sys.argv[2],'returnSecureToken':True}))" "$ACCOUNT" "$PW")
TOKEN=$(curl -sf -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" \
  -H 'Content-Type: application/json' -d "$BODY" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))") || TOKEN=""
[ -n "$TOKEN" ] || { log "오류: 로그인 실패"; exit 1; }

# 요청 노드만 내려받는다 (DB 전체 333KB → 요청만 수백 바이트)
JSON=$(curl -sf "$DB_BASE/nurseScheduler/changeRequests.json?auth=$TOKEN") \
  || { log "오류: 요청 목록 다운로드 실패"; exit 1; }

export REQ_JSON="$JSON" REQ_MODE="$MODE" REQ_STATE="$STATE" REQ_OUT="$OUT_DIR"
set +e   # 아래 python은 "알릴 것이 있음"을 종료코드 10으로 알린다
python3 <<'PY'
import json, os, datetime, pathlib

raw   = os.environ['REQ_JSON']
mode  = os.environ['REQ_MODE']
state = pathlib.Path(os.environ['REQ_STATE'])
outd  = pathlib.Path(os.environ['REQ_OUT'])

try:
    items = json.loads(raw) or []
except Exception:
    items = []
if isinstance(items, dict):          # RTDB가 객체로 돌려주는 경우
    items = list(items.values())
items = [r for r in items if isinstance(r, dict)]

LABEL = {'pending':'접수','reviewed':'확인','working':'수정중',
         'done':'반영완료','hold':'보류','rejected':'반려','approved':'수정중'}
def is_open(r): return r.get('status') not in ('done', 'rejected')

seen = set()
if state.exists():
    seen = set(state.read_text(encoding='utf-8').split())

def mark(ids):
    state.write_text('\n'.join(sorted(seen | set(ids))), encoding='utf-8')

def line(r):
    ctx = r.get('context') or {}
    tail = ''
    if ctx:
        tail = '  [{} · {} · {}]'.format(ctx.get('ward',''), ctx.get('ym',''), ctx.get('tab',''))
    return '[{}] {} {} — "{}"{}'.format(
        r.get('category','기타'), r.get('wardName',''),
        LABEL.get(r.get('status'),'접수'), r.get('title',''), tail)

if mode == 'alert':
    # 새로 들어온 오류신고만 — 접수 상태이고 아직 알리지 않은 것
    fresh = [r for r in items
             if r.get('category') == '오류신고' and r.get('status') == 'pending'
             and r.get('id') not in seen]
    if not fresh:
        print('새 오류신고 없음')
        raise SystemExit(0)
    for r in fresh:
        ctx  = r.get('context') or {}
        body = '{} · {}'.format(r.get('wardName',''), r.get('title',''))
        if ctx:
            body += '\n{} · {}'.format(ctx.get('ym',''), ctx.get('tab',''))
        print('ALERT\t🔴 오류신고\t' + body.replace('\n', ' / '))
    mark([r.get('id') for r in fresh])
    # 셸이 알림을 띄우도록 파일로 넘긴다
    (outd / '.alert-payload').write_text(
        '\n'.join('{} · {}'.format(r.get('wardName',''), r.get('title','')) for r in fresh),
        encoding='utf-8')
    raise SystemExit(10)   # 10 = 알릴 것이 있음

# brief 모드
opens = [r for r in items if is_open(r)]
new   = [r for r in opens if r.get('id') not in seen]
if not new:
    print('새 요청 없음 — 브리핑 생략')
    raise SystemExit(0)

today = datetime.date.today().isoformat()
buckets = {'새 요청': new,
           '진행 중': [r for r in opens if r.get('id') in seen and r.get('status') in ('reviewed','working')],
           '보류':    [r for r in opens if r.get('status') == 'hold']}
out = ['# 요청 브리핑 {}'.format(today), '']
for name, rows in buckets.items():
    if not rows: continue
    out.append('## {} {}건'.format(name, len(rows)))
    for i, r in enumerate(rows, 1):
        out.append('{}. {}'.format(i, line(r)))
        detail = str(r.get('detail','')).strip()
        if detail:
            out.append('   > ' + detail.replace('\n', '\n   > '))
        out.append('   요청ID `{}` · {}'.format(r.get('id',''), str(r.get('createdAt',''))[:16]))
    out.append('')
out.append('---')
out.append('처리: 앱 > 요청함에서 상태를 **수정중**으로 바꾸면 작업 대상이 됩니다.')

path = outd / '요청브리핑-{}.md'.format(today)
path.write_text('\n'.join(out), encoding='utf-8')
mark([r.get('id') for r in new])
(outd / '.alert-payload').write_text('새 요청 {}건 · 미처리 {}건'.format(len(new), len(opens)), encoding='utf-8')
print('브리핑 생성: {}'.format(path))
raise SystemExit(10)
PY
RC=$?
set -e

if [ "$RC" -eq 10 ]; then
  PAYLOAD=$(cat "$OUT_DIR/.alert-payload" 2>/dev/null | head -c 300)
  if [ "$MODE" = "alert" ]; then
    notify "🔴 병동 오류신고" "$PAYLOAD"
    log "오류신고 알림 발송"
  else
    notify "📋 요청 브리핑 $(date '+%m/%d')" "$PAYLOAD"
    log "브리핑 알림 발송"
  fi
elif [ "$RC" -ne 0 ]; then
  log "오류: 처리 실패 (rc=$RC)"; exit "$RC"
fi
exit 0
