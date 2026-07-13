#!/bin/bash
# AI Duty 운영 DB(RTDB) 정기 백업 — launchd가 매일 실행 (com.nurse-duty.db-backup)
# 인증: 백업 전용 계정 db-backup@nurse.duty.local (비밀번호는 macOS 키체인 'nurse-duty-backup')
# 보관: 로컬 ~/NurseSchedulerBackups + OneDrive-개인/NurseSchedulerBackups (이중 보관)
# 주의: 백업 JSON에는 간호사 실명이 포함되므로 git 저장소에 커밋하지 말 것.
set -euo pipefail

API_KEY="AIzaSyB8NiNjOhhCTYiU9YBB66lBD9KDgA3yth8"   # 공개 클라이언트 식별자 (보호막은 DB 규칙)
DB_URL="https://lsy-duty-f8012-default-rtdb.asia-southeast1.firebasedatabase.app/nurseScheduler.json"
ACCOUNT="db-backup@nurse.duty.local"
DEST="$HOME/NurseSchedulerBackups"
CLOUD_DEST="$HOME/Library/CloudStorage/OneDrive-개인/NurseSchedulerBackups"
KEEP_DAYS=180   # 이보다 오래된 백업은 자동 삭제

log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

PW=$(security find-generic-password -s nurse-duty-backup -a "$ACCOUNT" -w 2>/dev/null) \
  || { log "오류: 키체인에서 백업 계정 비밀번호를 찾지 못했습니다 (서비스명 nurse-duty-backup)"; exit 1; }

BODY=$(python3 -c "import json,sys;print(json.dumps({'email':sys.argv[1],'password':sys.argv[2],'returnSecureToken':True}))" "$ACCOUNT" "$PW")
TOKEN=$(curl -sf -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" \
  -H 'Content-Type: application/json' -d "$BODY" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('idToken',''))")
[ -n "$TOKEN" ] || { log "오류: 백업 계정 로그인 실패"; exit 1; }

mkdir -p "$DEST"
STAMP=$(date '+%Y-%m-%d_%H%M')
FILE="$DEST/nurseScheduler-$STAMP.json"
curl -sf "$DB_URL?auth=$TOKEN" -o "$FILE" || { log "오류: DB 다운로드 실패"; rm -f "$FILE"; exit 1; }

# 유효성 검사: JSON 파싱 가능 + 병동 데이터 존재
python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
assert isinstance(d,dict) and d.get('wards'), '병동 데이터 없음'
" "$FILE" || { log "오류: 내려받은 백업이 유효하지 않아 폐기합니다"; rm -f "$FILE"; exit 1; }

SIZE=$(du -h "$FILE" | cut -f1)
log "백업 완료: $FILE ($SIZE)"

# OneDrive 이중 보관 (폴더가 있으면)
if mkdir -p "$CLOUD_DEST" 2>/dev/null; then
  cp "$FILE" "$CLOUD_DEST/" && log "OneDrive 복사 완료" || log "경고: OneDrive 복사 실패 (로컬 백업은 정상)"
else
  log "경고: OneDrive 폴더에 접근 불가 (로컬 백업은 정상)"
fi

# 오래된 백업 정리 (로컬·OneDrive 동일 기준)
find "$DEST" -name 'nurseScheduler-*.json' -mtime +$KEEP_DAYS -delete 2>/dev/null || true
find "$CLOUD_DEST" -name 'nurseScheduler-*.json' -mtime +$KEEP_DAYS -delete 2>/dev/null || true
log "정리 완료 (보관 ${KEEP_DAYS}일)"
