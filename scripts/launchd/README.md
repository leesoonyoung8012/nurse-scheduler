# 요청 감시 자동화 등록 안내

수간호사 요청을 두 갈래로 처리한다.

| 작업 | 주기 | 하는 일 |
|---|---|---|
| `com.nurse-duty.request-alert` | 5분 | 새 **오류신고**가 들어오면 즉시 맥 알림 |
| `com.nurse-duty.request-brief` | 매일 16:00 | 미처리 요청을 모아 브리핑 파일 + 알림 |

- 스크립트: `scripts/request-watch.sh` (읽기 전용 — DB에 쓰지 않음)
- 인증: 키체인 `nurse-duty-backup` (`backup-db.sh`와 동일 계정 재사용)
- 출력: `~/NurseSchedulerRequests/요청브리핑-YYYY-MM-DD.md`
- 로그: `~/Library/Logs/nurse-duty-request.log`
- 새 요청이 없으면 파일도 알림도 만들지 않는다 (빈 알림은 무시하게 되므로)

## 먼저 손으로 1회 시험

키체인 접근이 되는지부터 확인한다.

```bash
cd "$HOME/Desktop/9. nurse-scheduler-shared-deploy"
./scripts/request-watch.sh alert    # 종료코드 0(새 오류신고 없음) 또는 10(알림 발송)
./scripts/request-watch.sh brief
```

## 등록

```bash
cp scripts/launchd/com.nurse-duty.request-*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nurse-duty.request-alert.plist
launchctl load ~/Library/LaunchAgents/com.nurse-duty.request-brief.plist
```

## 검증 (홈 CLAUDE.md 3항 — 둘 다 확인할 것)

```bash
launchctl list | grep nurse-duty.request      # 종료코드가 0인지
ls -l ~/Library/Logs/nurse-duty-request.log   # mtime이 갱신되는지
```

## 해제

```bash
launchctl unload ~/Library/LaunchAgents/com.nurse-duty.request-alert.plist
launchctl unload ~/Library/LaunchAgents/com.nurse-duty.request-brief.plist
rm ~/Library/LaunchAgents/com.nurse-duty.request-*.plist
```
