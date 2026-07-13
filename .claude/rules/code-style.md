# 코드 스타일 (항상 적용)

이 프로젝트는 **단일 HTML 파일 앱**이다: `public/index.html` (약 13,000줄, vanilla JS ES6+).
별도 빌드/번들러/프레임워크 없음. 모든 수정은 이 파일 안에서 이루어진다.

## 파일 구조 (index.html 내부 순서)

1. `<style>` — 전체 CSS
2. 메인 `<script>` — 데이터/UI/레거시 엔진 (defaultData, render*, step* 함수들)
3. `<script id="scheduler-engine-v2">` — V2 생성 엔진 (근무표 생성은 여기만 수정)
4. `<script type="module">` — Firebase 초기화 (window.nurseDb 래퍼)

## 기본 규칙

- 들여쓰기: **2칸 공백**, 세미콜론 사용
- 네이밍: 함수/변수 `camelCase`, 상수 객체 `UPPER_SNAKE` (예: `SCORE_WEIGHTS`)
- V2 엔진 단계 함수: `phase{번호}{알파벳}_{설명}` (예: `phase3a_placeChargeCoverage`)
- 내부 헬퍼: 언더스코어 접두 (예: `_blockStreakOK`, `_p6_canRecruit`, `_fillOneNightCell`)
- 주석·UI 문자열·경고 메시지는 **한국어**
- 섹션 구분 주석: `/* ── 제목 ─────── */` 형식 유지
- 기존 코드 스타일이 마음에 안 들어도 맞춰서 작성 (프로젝트 CLAUDE.md의 Surgical Changes 원칙)

## V2 엔진 불변식 (위반 금지)

- `schedule[date][nurseId] = shift` **직접 대입 절대 금지** — 반드시
  `state.assign()` / `state.lock()` / `state.clear()` 경유
- 배정 가능 판정은 **canAssign() 단일 게이트**로 통일.
  새 하드 규칙 추가 시 개별 phase가 아니라 canAssign 또는 블록 플래너
  (`planNightBlock` / `_blockStreakOK` / `_nightRecoverySlotsFree`)에 넣을 것
- **N(나이트)은 블록 단위로만 배정** — 단일 N 낱개 배정 경로를 새로 만들지 말 것
  (블록 확장 또는 `_fillOneNightCell` 사용)
- 블록 계획 중에는 블록 내부 날짜들이 서로 안 보인다 —
  연속·쿼터 검사는 반드시 블록 전체 기준으로 (`_blockStreakOK` 참고)
- 재배치처럼 실패 가능성이 있는 다단계 수정은 `state.snapshot()` → 실패 시
  `state.restore(snap)` 패턴 사용

## 날짜·코드 규약

- 월(m)은 **1부터 시작** (7 = 7월). 날짜 키: `makeDateKey(y,m,d)` → `"YYYY-MM-DD"`
- 근무 코드는 대문자: 근무 `D E N MD SD6` / 휴무 `O OF AL SL WO HA HP`
- 임시 스크립트·검증 파일은 저장소가 아니라 세션 스크래치패드에 생성
