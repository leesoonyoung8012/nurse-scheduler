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

- `nurses[]`: `id`(형식 `n-<timestamp>`), `name`,
  `skillLevel`(구분: `HN`=수간호사/관리(인원 산정 제외) | `LV1`=신규 | `LV2`=주니어 | `LV3`=중간 | `LV4`=시니어 —
  화면 표기는 신규/LV1 주니어/LV2 중간/LV3 시니어. 구 `LV5`는 시니어로 취급. 시니어=차지 커버.
  `skillTags`는 2026-08-09 폐지 — 데이터는 남아 있으나 읽지 않음), `workTypeIds`, `team`,
  개인설정: `maxNightPerMonth`, `min/maxConsecutiveNight`, `maxConsecutiveDays`,
  `min/maxConsecutiveOff`, `employmentStatus`("active"|"leave"|"inactive")
- `requests[]` / `leaveRequests[]`: `{nurseId, date:"YYYY-MM-DD", type:"WO"|"AL"|...}`
- `schedulesByMonth`: 키 `"YYYY-MM"` → `{ "YYYY-MM-DD": { nurseId: code } }`
  ⚠️ 날짜 키만 있고 셀이 빈 달이 존재할 수 있음 (빈 달 ≠ 없는 달)
- `staffingRules`: `{weekday|saturday|holiday: {D|E|N: {min,max}}}`
- `seniorStaffing`: 병동별 교대당 시니어 최소/최대 `{D|E|N: {min,max}}` —
  0 = 제한 없음, 노드 없으면 미적용(하위 호환). 시니어 판정 = `isNurseSeniorSupport`
  (LV4+ 또는 차지가능/프리셉터/교육담당 태그). 소프트 규칙: 자동생성이 D/E만
  교정(phase6d)하고 N은 경고로만 안내 (N 블록 단위 원칙).
- `nightRestDaysAfterBlock`: N 블록 후 회복 OFF **최소** 일수 (병동별 1~2, 기본 2 — 하드 잠금).
  대원칙(패턴 기반): 마지막 N 후 실제 OFF가 1개면 다음날 D 금지(E부터 가능)
- `nightRestDaysAfterBlockMax`: N 블록 후 회복 OFF **최대** 일수 (0 = 제한 없음, 기본 0).
  초과하지 않게 생성이 근무 복귀를 유도(소프트)하고 초과분은 경고로 표시
- `nightReentryGap`: N 재진입 텀(일) 병동별 설정 — `null`/노드 없음 = 근무유형의
  `rule.nightReentryGap`을 따름(하위 호환), 0 = 텀 없음, 1 이상 = 그 일수.
  읽기는 `stepNightReentryGapDays(n, ward)` 단일 경로. 나이트킵은 이 값과 무관하게 항상 0.
- `teamPolicy`: 팀별 구성 모드 `{enabled:bool, minPerTeam:{팀:{D,E,N}}}` —
  켜면 교대당 팀별 최소 인원을 보장(소프트)하고 레벨 균형 자동 교정(phase6d)은 꺼짐.
  노드 없으면 미적용(하위 호환)
- `leavePolicy`: 병동별 원티드 오프 신청 기준 (수간호사 휴가신청 탭에서 설정, 모바일 앱이 신청 시 적용)
  `{applyStart:"YYYY-MM-DD"|"", applyEnd:"YYYY-MM-DD"|"", maxPerDay:number|null, maxPerNurse:number|null, confirmFrom:number|null}`
  — null/빈문자열 = 제한 없음. `confirmFrom`개째부터 모바일 신청 차단(부서장 직접 등록 = 컨펌). 노드가 없으면 무제한(하위 호환).
  메인 앱 관리자 등록(휴가신청 탭)은 `checkLeavePolicy(ward,nurseId,date,type)`로 검사하되
  확인창으로 정책을 넘길 수 있고, 모바일(직원 본인)은 확인창 없이 거부. 대상은 WO만.
  이미 저장된 초과 신청은 수정하지 않고 목록에 "정책 초과" 표시만 한다.

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
