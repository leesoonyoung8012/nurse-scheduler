---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/tmp_*.js"
  - "**/*harness*.js"
  - "**/*validate*.js"
---

# 테스트/검증 컨벤션

> 이 프로젝트는 단위 테스트 프레임워크가 없다. 테스트 = **검증 하니스**:
> index.html의 스크립트를 Node `vm`으로 로드해 실데이터로 근무표를 생성하고
> 12개 규칙을 독립 검증기로 채점하는 방식.

## 하니스 구조 (재사용 패턴)

1. `public/index.html`에서 `<script>` 블록 2개 추출
   (메인: `function defaultData` 포함, V2: `const SchedulerEngine` 포함)
2. `vm.createContext`에 localStorage/document 스텁 주입 후 순서대로 실행
3. 실데이터 스냅샷 — DB 규칙상 이메일 로그인 토큰 필요 (비인증 curl은 401):
   `accounts:signInWithPassword`(REST)로 idToken 발급 후
   `curl ".../nurseScheduler.json?auth=<idToken>"`
4. `SchedulerEngine.run(ward, y, m)` 실행 → 결과를 독립 검증기로 채점

## 필수 원칙

- **엔진의 자체 리포트(getViolations)를 믿지 말 것.** 검증기는 엔진 코드와
  무관하게 결과 스케줄만 보고 12규칙을 다시 세어야 한다.
- 최소 **2개 월 이상** 교차 검증 (전월 이어받기 경계가 달라짐).
  전월 실데이터가 있는 달을 반드시 포함할 것.
- UI 경로 검증 별도 실행: `stepRunAll()` → `stepPushDraft()` →
  `enforceAbsoluteScheduleValidator` **removed=0** 확인
  (엔진 통과 ≠ 절대검증기 통과).
- 위반은 **하드/소프트 분리 집계**. 하드 잔여가 있으면 각 건이
  구조적(WO 잠금·쿼터 소진 등)인지 버그인지 설명 가능해야 통과.

## 파일 위치·네이밍

- 임시 검증 스크립트는 **세션 스크래치패드에 생성** — 저장소에 `tmp_*.js`를
  다시 커밋하지 말 것 (과거에 쌓여서 정리한 이력 있음).
- 이름은 목적이 드러나게: `harness.js`(생성), `validate12.js`(규칙 채점),
  `dbg_*.js`(원인 추적 프로브).
- 원인 추적 프로브는 "어느 간호사·어느 날짜·어느 조건이 거부됐나"를
  셀 단위로 출력하도록 작성 (통계만 내면 원인을 못 찾는다).

## 통과 기준 (배포 게이트)

- 하드 위반 0건, 또는 잔여 전건이 구조적 사유로 설명됨
- 절대검증기 removed 0건 · 미해결(unresolved)은 경고 성격만
- 빈칸 0 (모든 셀 채움), OFF 부족자 0명
