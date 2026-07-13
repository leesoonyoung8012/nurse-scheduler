# 배포 전 체크리스트

배포 대상: Firebase Hosting, 프로젝트 **lsy-duty-f8012**
(사이트: ai-duty-lsy.web.app + lsy-duty-f8012.web.app)

## 1. 배포 전 — 검증 (필수, 건너뛰기 금지)

- [ ] 검증 하니스로 근무표 생성 시뮬레이션 실행 (`.claude/rules/testing.md` 참고)
  - 최소 2개 월(전월 실데이터 있는 달 포함)
  - **12규칙 하드 위반 0건** 또는 잔여 전건 구조적 사유 설명 가능
- [ ] UI 경로 검증: `stepRunAll()` → 절대검증기 **removed=0** 확인
- [ ] 문법 확인: 하니스가 index.html 스크립트를 vm으로 로드하는 것 자체가
  파싱 테스트를 겸함 (로드 실패 = 문법 오류)
- [ ] UI를 바꿨으면 브라우저에서 실제 클릭 테스트
  (로컬 서버로 열기 → 병동 로그인 → 생성 버튼 — **저장 버튼은 누르지 말 것**)

## 2. 배포 계정/대상 확인

- [ ] `firebase login:list` → 활성 계정이 **leesoonyoung8012@gmail.com** 인지
  (아니면 `firebase login:use leesoonyoung8012@gmail.com`)
- [ ] 프로젝트가 lsy-duty-f8012인지 (구 프로젝트 nurse-scheduler-8d58e 금지)
- 환경변수/마이그레이션: 해당 없음 — 정적 호스팅 배포이며 DB 스키마는
  클라이언트가 하위 호환으로 처리 (`ensureDataDefaults`)

## 3. 배포

```bash
firebase deploy --only hosting:ai-duty-lsy,hosting:main --project lsy-duty-f8012
```

## 4. 배포 후 확인

- [ ] `curl -s https://ai-duty-lsy.web.app | grep -c "<이번 변경의 고유 문자열>"`
  → 새 코드가 서빙되는지 마커로 확인
- [ ] 실 사이트 접속해 로그인 → 근무표 생성 1회 동작 확인
- [ ] 사용자에게 검증 결과(규칙별 통과/위반 카운트) 보고

## 5. 롤백 플랜

- 호스팅만 배포되므로 롤백 = 이전 버전 재배포:
  - Firebase 콘솔 → Hosting → 릴리스 기록에서 이전 버전 "롤백" 클릭 (가장 빠름)
  - 또는 `git checkout <이전커밋> -- public/index.html` 후 재배포
- DB는 배포와 무관하므로 롤백 대상 아님. 단, 코드가 DB 구조를 바꾸는 저장을
  했다면 롤백 전 사용자와 상의할 것

## 6. 기록

- [ ] 구조·기능 큰 변경이면 Obsidian 위키 갱신:
  `Wiltse_General Affairs/06_AI Innovation TFT/nurse-scheduler.md`
- [ ] 커밋은 사용자가 요청할 때만
