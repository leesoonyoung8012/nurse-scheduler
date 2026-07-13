# 데이터 계약 (Firebase RTDB) — API 컨벤션

이 앱의 "API"는 REST 서버가 아니라 **Firebase Realtime Database 구조**다.
데이터 구조를 바꾸는 작업 전에 반드시 이 문서를 확인하고, 바꾸면 갱신할 것.

## 접속

- DB 경로 루트: `nurseScheduler` (프로젝트 lsy-duty-f8012, asia-southeast1)
- 클라이언트 접근: `window.nurseDb.ref(path).get() / .set(value) / .on('value', cb)`
- 저장은 앱 전역 `saveData()` 하나로 수렴 — 부분 경로 set을 새로 만들지 말 것

## 최상위 노드

| 노드 | 내용 |
|---|---|
| `wards[]` | 병동 배열 — 핵심 데이터 |
| `workTypes[]` | 근무유형 정의 (wt-three, wt-nightkeep, wt-office …) + rule |
| `commonScheduleSettings` | 전역 기본값 (defaultMaxConsecutiveDays 등) |
| `shiftCodes` / `placementRules` / `generationRules` | 코드·배치규칙 정의 |
| `users`, `globalHolidays`, `changeRequests`, `systemEvents` | 계정·공휴일·요청 |

## ward 객체 (주요 필드)

- `nurses[]`: `id`(형식 `n-<timestamp>`), `name`, `skillLevel`(LV1~5),
  `skillTags`(["차지가능","프리셉터","교육담당"]), `workTypeIds`,
  개인설정: `maxNightPerMonth`, `min/maxConsecutiveNight`, `maxConsecutiveDays`,
  `min/maxConsecutiveOff`, `employmentStatus`("active"|"leave"|"inactive")
- `requests[]` / `leaveRequests[]`: `{nurseId, date:"YYYY-MM-DD", type:"WO"|"AL"|...}`
- `schedulesByMonth`: 키 `"YYYY-MM"` → `{ "YYYY-MM-DD": { nurseId: code } }`
  ⚠️ 날짜 키만 있고 셀이 빈 달이 존재할 수 있음 (빈 달 ≠ 없는 달)
- `staffingRules`: `{weekday|saturday|holiday: {D|E|N: {min,max}}}`
- `nightRestDaysAfterBlock`: N 블록 후 회복 OFF 일수 (기본 2)
- `leavePolicy`: 병동별 원티드 오프 신청 기준 (수간호사 휴가신청 탭에서 설정, 모바일 앱이 신청 시 적용)
  `{applyStart:"YYYY-MM-DD"|"", applyEnd:"YYYY-MM-DD"|"", maxPerDay:number|null, maxPerNurse:number|null, confirmFrom:number|null}`
  — null/빈문자열 = 제한 없음. `confirmFrom`개째부터 모바일 신청 차단(부서장 직접 등록 = 컨펌). 노드가 없으면 무제한(하위 호환).

## 클라이언트별 쓰기 계약

- **메인 앱(index.html)**: 저장은 전역 `saveData()` 하나로 수렴(전체 노드 저장) —
  부분 경로 set을 새로 만들지 말 것.
- **간호사 모바일 앱(nurse.html)**: 쓰기는 오직
  `wards/<index>/leaveRequests` + `wards/<index>/requests` 두 경로(미러)와
  `nurseAccounts/<사번>/mustChangePw` (첫 로그인 비번 변경 완료 표시)뿐.
  쓰기 직전 최신 목록을 재조회해 병합 후 set (다른 노드는 읽기 전용).
  신청 아이템 형식은 메인 앱과 동일: `{id:"r-<ts>-<i>", nurseId, date, type, priority, note}`.

## nurseAccounts (간호사 사번 계정 매핑)

- 최상위 노드 `nurseAccounts`: 키 = **사번**(영숫자 3~30자),
  값 = `{wardId, nurseId, authRev, mustChangePw, createdAt, resetAt?}`.
- 인증계정 이메일은 `사번[-r<authRev>]@nurse.duty.local` — authRev 1이면 접미사 없음.
  (메인 앱 `NURSE_MOBILE_EMAIL_DOMAIN`/`nurseMobileEmail()`, nurse.html `EMP_DOMAIN`
  — 도메인·접미사 규칙은 반드시 양쪽 동일하게 유지).
- **초기 비밀번호는 전 병동 통일**: 메인 앱 상수 `NURSE_MOBILE_INIT_PW`.
- 생성 주체: 메인 앱 근무자 명단 탭 "모바일 계정 생성" (createAccount 래퍼,
  `authRev:1, mustChangePw:true`). nurse.html이 첫 로그인에서 비번 변경 후 false로 갱신.
- **비밀번호 초기화**: 수간호사가 "비밀번호 초기화" 클릭 → 다음 세대 계정
  `사번-r<N+1>@…`을 통일 초기비번으로 생성하고 authRev 증가 + mustChangePw:true.
  이전 세대 인증계정은 Auth에 남지만 nurse.html이 authRev 불일치로 로그인 거부.
- nurse.html 로그인: 사번 입력 시 rev 1→9 순서로 signIn 시도(비인증 상태에서
  authRev를 읽을 수 없기 때문), 성공 후 authRev와 대조해 구세대면 현재 세대로
  재시도 또는 차단.

## 규약

- 월(m)은 1부터. 날짜 키는 반드시 `makeDateKey(y,m,d)`로 생성 (zero-pad)
- 근무 코드는 항상 **대문자로 정규화**해서 비교 (`String(c).toUpperCase()`)
- 나이트킵 판정은 저장된 플래그가 아니라 **허용코드가 N뿐인지**로 계산
  (`isNightKeepNurse`) — 새 필드를 추가하지 말 것
- 생성 결과는 `setWardScheduleForMonth()`로 메모리에만 반영되고,
  사용자가 저장 버튼을 눌러야 DB에 기록됨 — 이 2단계 구조를 유지할 것
- 필드 추가는 하위 호환으로: 기존 데이터에 필드가 없어도 동작해야 함
  (`ensureDataDefaults()` / `normalizeWardStructure()`에 기본값 보강 추가)

## (향후 서버 API를 만들게 되면)

- 응답 포맷 `{ ok, data, error:{code,message} }`, 에러는 HTTP 상태코드와 일치
- 경로 버저닝 `/api/v1/...`, 하위 호환 깨지는 변경은 v2로
