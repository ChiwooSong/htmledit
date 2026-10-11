# Skills 1.1.0 검증

검증일: 2026-10-11. 개발 환경: Windows, Node.js 22.17, Chrome 및 Edge.

## 구현

- 단일 작업 사본을 공유하는 로컬 서버와 CLI, 메모 v1 호환.
- 버전 비교, 순차 저장, 원본 바이트 백업, 임시 파일 교체.
- 인증 토큰·출처 검사, 지정 파일 API, 기존 iframe 격리 유지.
- 파일 변경 감지, 브라우저 충돌 안내, 디스크 임시 복구.
- 두 스킬 설치·갱신·제거 및 npx 캐시에 의존하지 않는 실행 코드.

## 재현 명령

```powershell
npm ci
npm run check
npm run test:package
npm run format:check
```

`tests/local.test.ts`는 파일 트랜잭션과 HTTP 접근 경계를 검증합니다. `tests/e2e/local.spec.ts`는 Chrome·Edge에서 연결 저장, 외부 변경, 충돌, 임시 복구, 스크립트 격리를 검증합니다. 패키지 검증은 임시 사용자 홈과 npm tarball을 사용하며 실제 설치된 스킬을 변경하지 않습니다.

## 실행 결과

- 모델·파일·HTTP 단위 검증: **40개 통과**.
- Chrome·Edge 브라우저 검증: **46개 통과**. 연결 기능의 마지막 문구·복구 수정 후 관련 4개도 재검증했습니다.
- npm tarball로 분리된 임시 사용자 환경에 설치: 통과. 두 스킬 설치, 영구 실행 코드, 파일 열기·서버 재사용, checkout/apply/백업, 재설치, 수정된 스킬 보호, 종료·제거를 확인했습니다.
- 두 SKILL.md: skill-creator 검증기 통과.
- 실제 Claude Code 2.1.290: 실행을 시도했으나 현재 환경의 API 키가 HTTP 401로 거절되어 **반영 검증 미완료**. 예제 3개 메모는 변경되지 않았습니다.
- 실제 Codex CLI 0.162.0-alpha.2: 스킬 사용 의도를 인식했으나 환경 실행 정책이 SKILL.md를 읽는 PowerShell 명령을 차단해 **반영 검증 미완료**. 정책을 우회하지 않았습니다.

라이브 AI 검증에는 일반 API/계정 사용량이 발생할 수 있으며 자동 CI에서는 수행하지 않습니다. `node scripts/smoke-ai.mjs claude` 또는 `codex`로 예제 사본에 한정해 재현할 수 있습니다. 이 검증의 인증·정책 문제는 일반 설치·브라우저·파일 연결 테스트와 구분합니다.

## 공개 배포 검증

- GitHub 공개 저장소와 [v1.1.0 릴리스](https://github.com/ChiwooSong/htmledit/releases/tag/v1.1.0): 배포 완료. 공개 URL을 통한 설치와 예제 열기를 확인했습니다.
- npm 패키지 [@woody_s/htmledit 1.1.0](https://www.npmjs.com/package/@woody_s/htmledit): 2026-10-11 게시 및 공개 조회 확인. `latest`는 `1.1.0`입니다. 기본 이름 `htmledit`이 기존 `html-edit`와 유사하다는 npm 제한에 따라 계정 범위를 사용합니다.
- npm 레지스트리에서 실제 내려받아 별도의 임시 사용자 환경에 설치: 통과. Claude·Codex 두 스킬 설치, 영구 실행 코드, 파일 열기·HTTP 미리보기·서버 재사용, checkout/apply, 바이트 일치 백업, 원본 보존과 서버 종료를 확인했습니다.
- npm tarball SHA-1: `92e3d719206149b94bc89afeaef9122f33ddd56d`. 로컬 게시 파일과 공개 레지스트리 값이 일치합니다. 같은 파일을 GitHub 릴리스의 `woody_s-htmledit-1.1.0.tgz` 자산으로도 제공합니다.
- 공개 설치 검증은 위 실제 AI 반영 검증의 미완료 상태와 별개입니다.

## 운영 경계

- 서비스 로그인, MCP, AI 자동 실행, 원격 파일 동기화는 포함하지 않습니다.
- 상대 경로 자원 제공, 외부 API가 필요한 문서 동작은 기존 지원 범위 밖입니다.
- 충돌 검사는 HTMLEdit를 통한 동시 쓰기에 적용합니다. 임의의 외부 프로그램이 검사와 교체 사이에 파일을 쓰는 것을 강제로 잠그지는 않습니다.
- 백업과 후보 파일은 자동 삭제하지 않습니다. 디스크 공간 관리는 사용자가 수행합니다.
- npm 게시는 유지관리자 계정의 2FA 인증을 사용합니다.

## 1.1.1 재게시 (2026-10-11)

- 사유: 1.1.0을 tarball 경로로 게시한 탓에 npm 레지스트리 메타데이터의 `_resolved`·`_from` 필드에 게시자 PC의 절대 경로가 기록되었습니다. 레지스트리 메타데이터는 수정할 수 없고 같은 버전 번호는 재사용할 수 없으므로 1.1.1로 재게시하고, 1.1.0과 자리표시 버전 0.0.0-stage는 1.1.1 게시 뒤 unpublish합니다.
- 방식: `.github/workflows/release.yml`이 `v*` 태그 푸시에서 디렉터리 기준 `npm publish`를 npm trusted publishing으로 수행합니다. 장기 토큰이 없고 provenance가 자동으로 붙습니다. 릴리스 자산은 레지스트리에서 내려받은 tarball과 `SHA256SUMS`입니다.
- 동반 변경: GitHub Actions SHA 고정과 Dependabot 액션 갱신, `SECURITY.md`, 문서 옆 `.htmledit/`에 `*` `.gitignore` 자동 생성, README의 문서 조작 모드 한계 서술 정정, 스킬 지침의 URL 취급 보강.
- 검증: 게시 후 기록합니다.
