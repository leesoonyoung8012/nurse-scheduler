---
paths:
  - "public/**"
  - "firebase.json"
  - ".firebaserc"
  - ".github/**"
---

# 보안 규칙

> 이 프로젝트에는 auth 디렉터리·SQL·서버 코드가 없다. 실제 보안 지점은
> Firebase RTDB 접근 규칙, 간이 로그인, 개인정보(간호사 실명 근무 데이터)다.

## Firebase / 데이터 접근 (2026-07-02 이후 체계)

- `firebaseConfig`의 `apiKey`는 공개되어도 되는 클라이언트 식별자다.
  진짜 보호막은 **RTDB 보안 규칙**(`database.rules.json`):
  읽기/쓰기 모두 `auth.provider === 'password'` (이메일 로그인)만 허용.
  익명 인증 토큰·비인증 REST는 401로 차단됨. 이 규칙을 완화하지 말 것.
- 그래도 **환자 정보·주민번호·연락처 등 민감 개인정보를 DB에 저장하는 기능을
  절대 추가하지 말 것.** 저장 항목은 근무표 운영에 필요한 최소한(이름·레벨·근무설정)으로 제한.
- DB 쓰기는 반드시 기존 `saveData()` / `window.nurseDb` 래퍼 경유.
  임의 경로에 직접 `set()` 하는 코드를 새로 만들지 말 것.
- 검증/디버깅용 DB 덤프는 이메일 로그인 토큰(`?auth=<idToken>`)으로만 가능 —
  **세션 스크래치패드에만** 저장하고 저장소(git)에 커밋하지 말 것.

## 로그인 (Firebase Authentication 이메일 방식)

- 로그인은 `window.nurseAuth`(Firebase Auth 이메일/비밀번호) 경유.
  앱 자체 비밀번호 검사(`u.password`)를 되살리지 말 것 — users 노드에는
  이메일→역할/병동 매핑만 남는다 (password 필드 저장 금지).
- **기본 계정(admin/1234, ward51/ward52 등)을 defaultData나
  ensureDataDefaults에 다시 추가하지 말 것** — 과거 취약점의 원인.
- 계정 생성은 관리자 화면 "인증계정 생성" 또는 createAccount 래퍼(보조 앱
  인스턴스)로만. 비밀번호는 재설정 메일로 본인이 변경.

## 시크릿 관리

- 서비스 계정 키(*.json), CI 토큰, `.env` 파일은 **커밋 금지**.
  git에 올라간 흔적이 보이면 즉시 사용자에게 알릴 것.
- GitHub Actions 워크플로 수정 시 시크릿은 `${{ secrets.* }}` 참조만 사용,
  값을 워크플로 파일에 직접 쓰지 말 것.
- 배포는 leesoonyoung8012@gmail.com 계정 권한 필요
  (`firebase login:use leesoonyoung8012@gmail.com`).

## 작업 안전

- 운영 DB(lsy-duty-f8012)에 테스트 데이터를 쓰지 말 것.
  생성 테스트는 저장 버튼을 누르지 않는 한 DB에 반영되지 않음 — 저장 클릭 금지.
- 다른 Firebase 프로젝트(nurse-scheduler-8d58e 등 구 프로젝트)로 배포하지 말 것.
