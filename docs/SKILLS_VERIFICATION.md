# Skills 검증 기록

최신 홍보 예제 검증: [2026-10-14 공개 1.3.0 패키지의 Codex 메모 반영](AI_WORKFLOW_VERIFICATION.md). 화면에서 작성·저장한 요청 3개를 현재 Codex 세션이 해석하고 반영했으며 자동 갱신·백업·재열기·완성본을 검증했습니다. 기존 1.3.0 Claude 수동 승인 성공 결과도 파일 수준에서 재검사했습니다. 아래 기록은 각각 당시의 버전과 실행 환경을 기준으로 유지합니다.

검증일: 2026-10-11. 개발 환경: Windows, Node.js 22.17, Chrome 및 Edge.

1.1.0의 자동 검증과 초기 AI 실행 시도, 1.1.1의 공개 배포 및 Claude Code 실사용 검증을 구분해 기록합니다. **Claude Code의 실제 메모 반영은 1.1.1에서 통과했으며, Codex CLI의 실제 AI 반영 검증은 미완료입니다.**

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

## 1.1.0 실행 결과

- 모델·파일·HTTP 단위 검증: **40개 통과**.
- Chrome·Edge 브라우저 검증: **46개 통과**. 연결 기능의 마지막 문구·복구 수정 후 관련 4개도 재검증했습니다.
- npm tarball로 분리된 임시 사용자 환경에 설치: 통과. 두 스킬 설치, 영구 실행 코드, 파일 열기·서버 재사용, checkout/apply/백업, 재설치, 수정된 스킬 보호, 종료·제거를 확인했습니다.
- 두 SKILL.md: skill-creator 검증기 통과.
- 실제 Claude Code 2.1.290의 초기 CLI 시도: 당시 환경의 API 키가 HTTP 401로 거절되어 반영을 검증하지 못했습니다. 예제 3개 메모는 변경되지 않았습니다. 이후 1.1.1의 Remote Control 실사용 검증은 아래에 별도로 기록합니다.
- 실제 Codex CLI 0.162.0-alpha.2: 스킬 사용 의도를 인식했으나 환경 실행 정책이 SKILL.md를 읽는 PowerShell 명령을 차단해 **반영 검증 미완료**. 정책을 우회하지 않았습니다.

라이브 AI 검증에는 일반 API/계정 사용량이 발생할 수 있으며 자동 CI에서는 수행하지 않습니다. `node scripts/smoke-ai.mjs claude` 또는 `codex`로 예제 사본에 한정해 재현할 수 있습니다. 이 검증의 인증·정책 문제는 일반 설치·브라우저·파일 연결 테스트와 구분합니다.

## 1.1.0 공개 배포 검증 (당시 기록)

- GitHub 공개 저장소와 [v1.1.0 릴리스](https://github.com/ChiwooSong/htmledit/releases/tag/v1.1.0): 배포 완료. 공개 URL을 통한 설치와 예제 열기를 확인했습니다.
- npm 패키지 [@woody_s/htmledit 1.1.0](https://www.npmjs.com/package/@woody_s/htmledit): 2026-10-11 게시 및 공개 조회 확인. 당시 `latest`는 `1.1.0`이었으며, 이후 1.1.1 게시와 1.1.0 제거를 완료했습니다. 기본 이름 `htmledit`이 기존 `html-edit`와 유사하다는 npm 제한에 따라 계정 범위를 사용합니다.
- npm 레지스트리에서 실제 내려받아 별도의 임시 사용자 환경에 설치: 통과. Claude·Codex 두 스킬 설치, 영구 실행 코드, 파일 열기·HTTP 미리보기·서버 재사용, checkout/apply, 바이트 일치 백업, 원본 보존과 서버 종료를 확인했습니다.
- npm tarball SHA-1: `92e3d719206149b94bc89afeaef9122f33ddd56d`. 로컬 게시 파일과 공개 레지스트리 값이 일치합니다. 같은 파일을 GitHub 릴리스의 `woody_s-htmledit-1.1.0.tgz` 자산으로도 제공합니다.
- 공개 설치 검증은 실제 AI의 메모 반영 검증과 별개입니다.

## 운영 경계

- 서비스 로그인, MCP, AI 자동 실행, 원격 파일 동기화는 포함하지 않습니다.
- 상대 경로 자원 제공, 외부 API가 필요한 문서 동작은 기존 지원 범위 밖입니다.
- 충돌 검사는 HTMLEdit를 통한 동시 쓰기에 적용합니다. 임의의 외부 프로그램이 검사와 교체 사이에 파일을 쓰는 것을 강제로 잠그지는 않습니다.
- 백업과 후보 파일은 자동 삭제하지 않습니다. 디스크 공간 관리는 사용자가 수행합니다.
- 1.1.1부터 npm 게시는 `v<버전>` 태그 푸시로 시작하는 GitHub Actions의 trusted publishing을 사용합니다. 로컬에서 `npm publish`를 실행하지 않습니다.

## 1.1.1 재게시 (2026-10-11)

- 사유: 1.1.0을 tarball 경로로 게시한 탓에 npm 레지스트리 메타데이터의 `_resolved`·`_from` 필드에 게시자 PC의 절대 경로가 기록되었습니다. 레지스트리 메타데이터는 수정할 수 없고 같은 버전 번호는 재사용할 수 없으므로 1.1.1로 재게시하고, 1.1.0과 자리표시 버전 0.0.0-stage는 1.1.1 게시 뒤 unpublish합니다.
- 방식: `.github/workflows/release.yml`이 `v*` 태그 푸시에서 디렉터리 기준 `npm publish`를 npm trusted publishing으로 수행합니다. 장기 토큰이 없고 provenance가 자동으로 붙습니다. 릴리스 자산은 레지스트리에서 내려받은 tarball과 `SHA256SUMS`입니다.
- 동반 변경: GitHub Actions SHA 고정과 Dependabot 액션 갱신, `SECURITY.md`, 문서 옆 `.htmledit/`에 `*` `.gitignore` 자동 생성, README의 문서 조작 모드 한계 서술 정정, 스킬 지침의 URL 취급 보강.
- 검증(2026-10-11): 1.1.1을 12:39 UTC에 trusted publishing으로 게시했습니다. 레지스트리 메타데이터에 `_resolved`·`_from`이 없고 `_npmUser`는 GitHub Actions이며 provenance 증명(`dist.attestations`)이 있습니다. `npx @woody_s/htmledit@latest --version`과 README의 릴리스 URL 설치가 모두 1.1.1을 출력했습니다. GitHub 릴리스 v1.1.1 자산 tarball의 SHA-1 `80c1fe8e3aebe8b6a853021921c9ea949b56fc2e`가 레지스트리 값과 일치하고, SHA-256 `0e68afecf891ac0c7663b803abbe10641d3639cf3d2b7be90fc059b8c83f4fe4`를 `SHA256SUMS`로 제공합니다.
- 첫 실행의 실패 두 건: npmjs.com의 trusted publisher에 `npm publish` 허용 동작이 없어 E403("OIDC permission denied for this action")이 났고, 허용 후 재실행에서는 레지스트리 전파가 60초 재시도 창을 넘겨 릴리스 단계가 ETARGET으로 끝났습니다. 릴리스는 레지스트리 tarball로 수동 생성했고, 워크플로는 게시·릴리스 job을 분리하고 재시도 창을 6분으로 늘렸습니다.
- 1.1.0과 0.0.0-stage unpublish: 2026-10-11 완료. 레지스트리 `versions`에 1.1.1만 남았고 어느 버전의 메타데이터에도 로컬 경로가 없음을 확인했습니다.

## 1.1.1 Claude Code 실사용 검증 (2026-10-11)

**결과: 통과.** Windows PC에 연결된 Claude Code Remote Control 세션을 Codex 내장 브라우저에서 조작해, npm 스킬 설치부터 화면 편집·메모 저장·실제 Claude 반영·완성본 다운로드까지 확인했습니다. Claude의 완료 보고와 별도로 편집기 화면과 파일을 검증했습니다. 클라우드에서 독립 실행되는 Claude Code 세션을 검증한 것은 아닙니다.

### 진행한 사용자 흐름

1. Claude에게 `npx @woody_s/htmledit@1.1.1 install --agent claude`를 요청했습니다. 기존 1.1.0 설치가 1.1.1로 갱신됐고, 수정된 스킬 보호 오류는 발생하지 않았습니다. 설치된 `SKILL.md`를 읽은 뒤 해당 스킬의 runner를 사용했습니다.
2. `.cache/` 아래 별도 테스트 폴더에 한국어 소개 페이지 `studio-intro.html`을 만들고 `open --no-browser --json`으로 작업 사본 `studio-intro.review.html`을 열었습니다. 내장 브라우저를 같은 PC의 편집기에 연결했습니다.
3. 소개 문구를 화면에서 더블클릭해 직접 수정하고, 아래 세 메모를 요소별로 추가한 뒤 **작업 파일 저장**을 눌렀습니다. 디스크 상태에서 미완료 메모 3개와 각 대상의 연결을 확인했습니다.
4. 같은 Claude 대화에 저장된 메모 반영을 요청했습니다. Claude는 `status → checkout → 후보 파일 수정 → apply → status` 순서로 처리했습니다.
5. 편집기를 수동으로 새로고침하지 않아도 결과가 자동 반영됐고, 메모 목록은 **전체 3 · 완료 3 · 미완료 0**으로 바뀌었습니다.
6. **완성본 저장**으로 `studio-intro.edited.html`을 내려받아 결과와 편집기 메타데이터 제거를 검사했습니다.

### 요청과 결과

| 작업                | 입력 또는 요청                                                        | 확인 결과                                                                                  |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 직접 편집           | 소개 문구를 “작은 아이디어를 멋진 웹사이트로 만듭니다.”로 수정        | Claude 반영 후에도 그대로 보존                                                             |
| 제목 메모 · 이 요소 | “우리 동네 디자인 스튜디오”를 “함께 만드는 우리 동네 웹사이트”로 변경 | 문구 변경, 기존 스타일 유지, 메모 완료                                                     |
| 버튼 메모 · 안쪽    | “상담하기” 앞에 외부 파일 없는 말풍선 SVG 추가                        | 버튼 내부에 인라인 SVG 추가, `aria-hidden="true"` 설정, 버튼 문구와 `type` 보존, 메모 완료 |
| 설명 메모 · 이 요소 | “삭제할 임시 설명입니다.” 문단 삭제                                   | 해당 문단 제거, 주변 소개와 버튼 보존, 메모 완료                                           |

### 파일 및 화면 검증

- 원본 HTML의 SHA-256이 작업 전후 동일했습니다.
- `apply`가 만든 백업은 AI 반영 직전 저장한 작업 파일과 바이트 단위로 일치했습니다.
- 메모 3개의 ID·대상 ID·위치 관계·요청 내용·대상 요약이 유지되고, 완료 상태만 `false`에서 `true`로 바뀌었습니다.
- 삭제된 문단의 완료 메모는 유지되며 편집기에서 **대상 없음**으로 표시됐습니다. 남은 두 메모는 기존 요소에 연결됐습니다.
- 기존 `<style>` 내용이 유지됐습니다. 편집기 화면에서 새 제목과 말풍선 아이콘, 직접 수정한 소개 문구 및 설명 삭제를 확인했습니다.
- 완성본에도 새 제목이 반영됐고, `data-htmledit-*` 속성, `script#htmledit-review`, AI 전달 주석이 없었습니다.
- 저장소 코드·배포·Git 설정은 이번 실사용 시험에서 변경하지 않았습니다.

로컬 증거는 `.cache/user-flow-20261011-215710/`에 보관했습니다. `verification.json`은 검사 결과, `verify.mjs`는 파일 검증 스크립트, `before-ai.review.html`은 반영 직전 사본, `before-ai.png`와 `after-ai.png`는 편집기 화면입니다. 이 자료는 Git에서 제외되며, 공개 문서에는 연결 토큰·세션 URL·PC의 절대 경로를 포함하지 않습니다.

### 검증 범위

이번 결과는 **Claude Code + 로컬 Remote Control + HTMLEdit 1.1.1**의 한 예제 흐름에 대한 실사용 증거입니다. Codex 스킬의 설치·자동 검증 결과와 구분하며, **Codex CLI의 실제 AI 메모 반영은 여전히 미완료**입니다. 이번 시험에서 전체 자동 테스트를 다시 실행하지 않았으며, 앞 절의 40개 단위 테스트와 46개 브라우저 테스트는 기존 실행 기록입니다.

## 다른 문서 열기 · 개발본 검증 (2026-10-11)

- 연결 모드의 비활성화된 HTML 열기를 **다른 문서 열기**로 교체했습니다. 미저장 작업은 저장 후 선택·저장하지 않고 선택·취소 중 선택하고, Windows 파일 선택 창에서 새 HTML을 고릅니다. 미적용 문구·메모는 먼저 적용하거나 취소하도록 안내합니다.
- 기존 작업 사본은 덮어쓰지 않고 재사용합니다. 파일 선택 취소·오류·같은 파일 선택 시 현재 문서와 변경 내역을 유지하며, 저장 실패 시 파일 선택을 시작하지 않습니다. 저장하지 않은 변경은 이동 전에 기존 문서의 복구용 임시 작업으로 보관합니다.
- 새 파일의 서버와 토큰으로 같은 탭을 이동하며, 기존 서버의 지정 파일은 바꾸지 않습니다. API로 임의 경로를 받지 않고, 같은 출처와 인증을 확인한 요청만 OS 파일 선택 창을 열 수 있습니다. 중복 요청은 거절합니다.
- 빌드 및 단위 테스트 **43개 통과**. Chrome·Edge의 연결 모드 테스트 **10개 통과**(새 전환 시나리오 6개 포함). 파일 선택은 자동 테스트에서 주입한 선택기로 재현하고 실제 로컬 서버·저장·탭 이동을 검증했습니다.
- 전체 브라우저 테스트는 첫 실행에서 **51/52 통과**했습니다. 기존 Edge의 ‘원본 예제와 완성본의 브라우저 렌더링이 같다’ 이미지 바이트 비교 1건이 실패했고, 해당 테스트 단독 재실행은 통과했습니다. 전체 실행이 한 번에 모두 통과한 것으로 기록하지 않습니다.
- 패키지 설치 검증, 형식 검사, `git diff --check` 통과. 이 개발본 검증 시점에는 npm 재게시나 릴리스 태그 생성 전이었습니다. 이후 공개 배포 결과는 다음 절에 기록합니다.
- 실제 Windows 선택 창 검증도 통과했습니다. 사용자가 창에서 `second.html`을 선택한 뒤 내장 브라우저의 같은 탭이 `second.review.html`의 새 연결로 이동했습니다. 새 화면에서 제목을 수정·저장했고, 새 작업 파일만 변경되며 이전 작업 파일과 두 원본 HTML은 보존됨을 확인했습니다.

## 1.2.0 공개 배포 (2026-10-11)

- 문서 전환 기능과 버전 변경을 `6c13d38`로 main에 푸시했습니다. [Windows CI](https://github.com/ChiwooSong/htmledit/actions/runs/38143160811)에서 빌드, 형식 검사, 단위 테스트 43개, Chrome·Edge 브라우저 테스트 52개, 패키지 설치 검증이 모두 통과했습니다. 앞 절의 개발본 재시도 기록과 구분되는 전체 성공 실행입니다.
- 해당 커밋의 `v1.2.0` 태그를 푸시해 [Release 워크플로](https://github.com/ChiwooSong/htmledit/actions/runs/38143474859)를 실행했습니다. publish와 release job이 모두 성공했습니다. 로컬 `npm publish`는 실행하지 않았습니다.
- npm의 공개 버전과 `latest`는 `1.2.0`입니다. `_npmUser`는 GitHub Actions이며 `dist.attestations`에 SLSA provenance가 있습니다. `_resolved`·`_from` 필드가 없음을 확인했습니다.
- [GitHub v1.2.0 릴리스](https://github.com/ChiwooSong/htmledit/releases/tag/v1.2.0)의 tarball을 내려받아 npm 레지스트리 tarball 및 `SHA256SUMS`와 비교했습니다. SHA-256은 `c01c76d7078206fef034239f8c4e1b92433dfdb5a8e1b10e511716c4c9288545`, 레지스트리 SHA-1은 `ce8dacc2c89d7c51a727f20e90ac6a9f1f8a417b`입니다.

## 1.2.0 Claude Code 실사용 검증 (2026-10-11)

**결과: 통과.** 공개 npm 패키지로 설치한 새 Claude 세션에서 문서 전환 후 새 작업 파일의 메모 반영까지 확인했습니다. Claude의 보고와 별도로 브라우저 화면 및 파일을 검사했습니다.

- 같은 Windows PC에 연결된 새 Claude Code Remote Control 세션에서 `npx --yes @woody_s/htmledit@1.2.0 install --agent claude`를 실행했습니다. 설치된 스킬의 runner가 `versions/1.2.0/runtime/cli.mjs`를 참조하며, 해당 runner로 연 편집기의 버전이 1.2.0임을 확인했습니다.
- 설치 중 발견한 재현 조건: 동일 이름·버전의 개발 저장소 루트에서 npm 11.6.0의 npx를 실행하면 로컬 패키지가 우선되어 `htmledit is not recognized`로 실패했습니다. 저장소 밖의 빈 폴더에서 공개 패키지를 설치하면 성공합니다. Claude는 테스트 전용 새 캐시로도 공개 tarball 다운로드와 설치를 확인했습니다. 기존 캐시·전역 설정을 삭제하지 않았고, 로컬 빌드로 대체하지 않았습니다.
- 테스트 문서는 `.cache/release-1.2.0-live/`의 `first.html`과 `second.html`입니다. 공개 문서에는 연결 토큰과 세션 URL, PC 절대 경로를 기록하지 않습니다.
- 첫 문서의 제목을 화면에서 “첫 문서 저장 후 전환 검증”으로 수정한 뒤 **다른 문서 열기**를 눌렀습니다. 미저장 확인 창에서 **취소**하면 문구와 현재 연결이 유지됐습니다. 다시 **저장 후 문서 선택**을 실행해 사용자가 실제 Windows 파일 선택 창에서 `second.html`을 골랐습니다.
- 같은 브라우저 탭이 새 서버의 `second.review.html`로 이동했습니다. 전환 후 첫 작업 파일에 제목 변경이 저장됐으며 두 원본의 SHA-256이 유지됨을 확인했습니다.
- 두 번째 문서의 h1에 “새 문서 연결과 Claude 반영 성공”으로 바꾸고 글자색·배치를 유지하라는 메모 1개를 추가하고 **작업 파일 저장**을 눌렀습니다. 새 작업 파일 경로를 같은 Claude 대화에 명시해 반영을 요청했습니다.
- Claude는 설치된 runner로 `status → checkout → 후보 파일 수정 → apply → status`를 수행했습니다. 편집기는 수동 새로고침 없이 새 제목으로 갱신됐고 메모 목록에 **전체 1 · 완료 1 · 미완료 0**이 표시됐습니다.
- 별도 `verify.mjs` 검사 통과: 두 원본의 해시 보존, 첫 작업 파일의 저장 이후 바이트 보존, 두 번째 제목 변경, 스타일 보존, 메모 ID·내용·대상·위치 관계·대상 요약 보존, 완료 상태 변경, 반영 직전 작업 파일과 백업의 바이트 일치.

로컬 증거는 같은 테스트 폴더의 `SHA256SUMS`, `before-ai.review.html`, `first-saved.sha256`, `verify.mjs`, `verification.json`, `before-ai.png`, `after-ai.png`에 보관했습니다. 이번 검증은 Windows의 Claude Code Remote Control과 공개 HTMLEdit 1.2.0의 한 문서 전환 흐름에 한정합니다. 독립 클라우드 세션, 다른 운영체제의 파일 선택 창, Codex CLI의 실제 AI 반영 검증으로 확대 해석하지 않습니다.

## 1.2.0 Codex 스킬 실사용 검증 (2026-10-11)

**결과: 통과.** 사용자가 설치한 Codex 스킬의 설치 표식과 runner가 1.2.0임을 확인하고, 이 Codex 데스크톱 작업에서 설치된 스킬을 읽어 문서 열기부터 실제 메모 반영까지 수행했습니다. 별도의 Codex CLI 프로세스를 시작한 시험은 아니며, 앞의 1.1.0 CLI 실행 정책 실패 기록과 구분합니다.

1. 기존 예제 원본을 별도 `.cache/codex-live-1.2.0-20261011/codex-studio.html`로 복사하고 SHA-256을 기록했습니다. 설치된 Codex 스킬 runner의 `open --no-browser --json` 결과로 내장 브라우저를 연결했습니다. 로컬 개발 빌드를 실행하지 않았습니다.
2. 소개 문구를 화면에서 더블클릭해 “작은 아이디어를 Codex와 함께 웹으로 만듭니다. ✨”로 직접 수정했습니다.
3. 제목 변경, 버튼 안쪽 말풍선 SVG 추가, 임시 설명 삭제의 세 메모를 화면에서 작성하고 **작업 파일 저장**을 눌렀습니다. 아이콘 요청에는 `<svg>`와 `aria-hidden="true"`가 포함됐으며 저장된 JSON과 문서가 정상 유지됐습니다.
4. Codex가 설치된 스킬의 `status → checkout → 후보 파일 수정 → apply → status` 순서로 세 요청을 처리했습니다. 제목은 “Codex와 함께 만드는 웹사이트”로 바꾸고, 버튼에는 외부 자원 없는 장식용 SVG를 추가하며, 지정한 임시 문단만 삭제했습니다.
5. 수동 새로고침 없이 편집기가 갱신됐습니다. 화면에서 새 제목·아이콘·직접 수정한 소개 문구·설명 삭제를 확인했고, 메모는 **전체 3 · 완료 3 · 미완료 0**으로 표시됐습니다. 삭제된 문단의 완료 메모는 **대상 없음**으로 유지됐습니다.
6. **완성본 저장**으로 `codex-studio.edited.html`을 다운로드하고 파일을 검사했습니다.

별도 `verify.mjs` 검사에서 원본 SHA-256 보존, 백업과 반영 직전 작업 파일의 바이트 일치, 기존 스타일과 직접 편집한 문구 보존, 메모 ID·요청·대상·위치 관계·대상 요약 보존 및 완료 상태 변경을 확인했습니다. 완성본에는 변경 결과가 포함되고 `data-htmledit-*`, 메모 JSON, AI 전달 주석은 없었습니다. **검사 통과, 미해결 요청 0개**입니다.

로컬 증거는 위 테스트 폴더의 `original.sha256`, `before-ai.review.html`, `verify.mjs`, `verification.json`, `before-ai.png`, `after-ai.png`, `codex-studio.edited.html`입니다. apply 백업은 같은 폴더 아래 `.htmledit/b2f86f3b64189ab1/backups/1791726866205-2db1ac55-4b28-4cef-afca-8a8143b7baf2.html`에 보관했습니다. 이번에는 다른 문서 선택 창과 전체 자동 테스트를 재실행하지 않았으며 기존 Claude 문서와 서버는 변경하지 않았습니다.

## 정렬된 소스 보기 파일의 메뉴 복원 수정 (2026-10-11, 개발본 검증)

- 실사용 문서에서 메뉴 클릭 시 `getElementById('s0')` 결과가 null이어서 화면 전환 함수가 실패했습니다. 소스 보기 HTML을 정렬하면서 구문 강조 span 앞뒤에 삽입된 줄바꿈이, 복원 후 `id` 값 안에 남은 것이 원인이었습니다. 스크립트 차단 문제가 아니었습니다.
- 소스 보기 표의 한 행이 원본 한 줄이라는 규칙에 따라 각 셀 내부의 줄바꿈을 제거하고 행 사이에서만 원본 줄바꿈을 복원합니다. 공백·빈 행·엔티티·스크립트 보존과 ID 기반 메뉴 전환 회귀 테스트를 추가했습니다.
- 빌드, 단위 테스트 **44개**, Chrome·Edge의 문서 조작 테스트 **8개**, 변경 파일 형식 검사와 `git diff --check`가 통과했습니다. 전체 브라우저 테스트를 다시 실행한 결과는 아닙니다.
- 현재 열려 있던 작업 사본은 `checkout → 후보 수정 → apply`로 ID 17개의 앞뒤 줄바꿈만 복구했습니다. 별도 검사에서 그 외 바이트가 그대로이고 백업 SHA-256이 반영 전 리비전과 일치함을 확인했습니다. 원본 파일은 수정하지 않았습니다.
- 내장 브라우저에서 **전체 채팅** 클릭 후 실제 채팅 화면으로 이동하고, 직접 편집 모드에서도 그 화면이 유지됨을 확인했습니다. 실제 소스 파일을 수정된 가져오기 코드로 다시 읽으면 8개 화면 ID가 정상 복원됩니다.
- 이 절의 검증 시점에는 로컬 개발본이었으며 npm 1.2.0 설치본을 교체하거나 새 릴리스를 게시하지 않았습니다. 이후 1.2.1 배포 변경에 포함했습니다. 당시 작업 사본의 복구는 1.2.0 설치본에서도 바로 동작합니다. 로컬 증거는 `.cache/verify-source-import.ts`, `.cache/source-viewer-menu-fixed.png`입니다.

## 1.2.1 배포 전 검증 (2026-10-11)

- 소스 보기 복원 수정과 위 Codex 실사용 기록을 포함해 package.json과 lockfile을 1.2.1로 올렸습니다.
- 1.2.1 빌드, 단위 테스트 **44개**, 전체 형식 검사 및 `git diff --check` 통과.
- 1.2.1 tarball의 격리 설치 검증 통과: Claude·Codex 스킬 설치, 영구 runtime, 문서 열기·서버 재사용, checkout/apply/백업, 재설치, 수정된 스킬 보호, 종료·제거. 현재 사용 중인 스킬과 문서 서버를 바꾸지 않고 별도의 임시 사용자 환경에서 수행했습니다.
- main의 Windows CI가 통과한 커밋에 `v1.2.1` 태그를 푸시하는 방식으로 게시합니다. 로컬 `npm publish`는 사용하지 않습니다. 공개 게시 결과와 CI 링크는 [v1.2.1 릴리스](https://github.com/ChiwooSong/htmledit/releases/tag/v1.2.1)에 기록합니다.

## AI 요청 복사 시 작업 저장 (2026-10-13, 개발본 검증)

- 기존 복사 버튼은 클립보드에 전달 문구만 기록해 메모를 작업 파일에 저장하는 별도 단계가 필요했습니다. **저장하고 AI 요청 복사** 버튼은 현재 수정과 추가한 메모를 저장한 다음 전달 문구를 복사합니다. 연결 모드는 기존 작업 파일을 저장하고, 다운로드 모드는 전달용 HTML 다운로드를 시작합니다.
- 미적용 문구·메모, 저장 실패·충돌, 저장 중 추가 편집이 발생한 경우에는 전달 문구를 복사하지 않습니다. 복사 중 중복 요청과 문서 전환을 막습니다. 저장 후 클립보드 복사만 실패하면 작업 파일 경로가 포함된 전달 문구를 사용 방법에서 직접 복사할 수 있습니다.
- 빌드, 단위 테스트 **44개**, 관련 Chrome·Edge 브라우저 테스트 **12개**, 변경 파일 형식 검사, Claude·Codex 스킬 형식 검증 및 `git diff --check` 통과. 전체 브라우저 테스트를 다시 실행한 결과는 아닙니다.
- 내장 브라우저에서 별도 예제 문서에 메모를 추가했습니다. 복사 버튼을 누르기 전 작업 파일에는 메모가 없었고, 버튼을 누른 뒤 파일에 해당 메모가 저장됐으며 클립보드에 그 작업 파일의 정확한 경로가 포함됐습니다. 상단 **작업 파일 저장**은 누르지 않았습니다.
- 자동 브라우저 검증에서는 저장된 메모를 checkout한 후보에 반영하고 apply와 같은 검증·백업 저장 경로를 거친 뒤, 수동 새로고침 없이 새 제목과 완료 메모가 표시되는 것도 확인했습니다. 이번 테스트는 외부 AI 서비스 호출을 포함하지 않습니다.
- 로컬 증거: `.cache/handoff-save-copy-live-1791856060016/verification.json`, `saved-and-copied.png`, `demo.review.html`. 이 절의 검증 시점에는 GitHub에 푸시하거나 npm에 게시하지 않았으며, 이후 1.2.2 배포 변경에 포함했습니다. 설치된 1.2.1 스킬 실행 코드는 변경하지 않았습니다.

## 1.2.2 배포 전 실사용 재검증 (2026-10-13)

**결과: 통과.** 1.2.2로 빌드한 tarball을 별도 사용자 환경에 설치하고, 설치된 Codex 스킬 runner로 연 편집기를 내장 브라우저에서 검증했습니다. 개발 서버가 아닌 배포 후보 패키지이며, 현재 사용 중인 스킬과 문서 서버는 교체하지 않았습니다.

1. 예제 `workflow.html`을 열고 소개 문구를 화면에서 직접 수정했습니다. 제목 변경, 버튼 안쪽 체크 SVG 추가, 임시 설명 삭제의 세 메모를 화면에서 작성했습니다.
2. 디스크의 작업 파일에는 메모가 0개인 것을 확인한 뒤 **저장하고 AI 요청 복사**만 눌렀습니다. 상단 저장 버튼 없이 직접 수정과 메모 3개가 저장됐으며, 클립보드의 요청에 정확한 작업 파일 경로가 포함됐습니다.
3. 이 Codex 작업에서 실제 메모를 읽고 `status → checkout → 후보 파일 수정 → apply → status`를 수행했습니다. 세 요청을 반영하고 해당 메모만 완료로 표시했습니다. 반영 전 리비전 검사와 백업 생성을 확인했습니다.
4. 브라우저를 다시 열거나 새로고침하지 않고 변경된 제목, SVG 아이콘, 설명 삭제, 직접 수정한 소개 문구의 보존을 확인했습니다. 메모 목록은 **전체 3 · 완료 3 · 미완료 0**이며, 삭제된 설명의 완료 메모는 **대상 없음**으로 유지됐습니다.
5. 별도 파일 검사에서 원본 보존, 메모 ID·대상·요청·위치 관계·요약 보존, 완료 상태 변경, 반영 직전 작업 파일과 백업의 바이트 일치를 확인했습니다.

1.2.2 빌드 및 tarball 설치 검증도 통과했습니다. 설치 검증은 Claude·Codex 스킬 설치, 영구 runtime, 문서 열기·서버 재사용, checkout/apply/백업, 재설치, 수정된 스킬 보호, 종료·제거를 포함합니다. 이번 실제 AI 반영은 Codex 데스크톱에서 수행했으며, Claude 세션을 새로 실행한 검증은 아닙니다.

로컬 증거는 `.cache/release-1.2.2-live/`의 `before-ai.review.html`, `before-ai.png`, `after-ai.png`, `checkout.json`, `apply.json`, `verification.json`에 보관했습니다. main의 Windows CI 통과 후 `v1.2.2` 태그를 푸시해 trusted publishing으로 게시합니다. 로컬 `npm publish`는 사용하지 않습니다. 공개 게시 결과와 CI 링크는 [v1.2.2 릴리스](https://github.com/ChiwooSong/htmledit/releases/tag/v1.2.2)에 기록합니다.

## 1.3.0 multilingual candidate verification (2026-10-13)

**Implementation, automated validation, and actual Codex and Claude workflows passed. Claude completed the follow-up using user-selected manual approval mode. Version 1.3.0 was subsequently published on 2026-10-14 KST; the publication receipt is below.** Historical verification sections above retain their original language and results.

### Scope and automated evidence

- Added `ko`, `en`, `es`, `ja`, and `pt-BR` for the editor, shared diagnostics, CLI output/help, bundled examples, installation/use/troubleshooting guides, and review-format documentation. English is the fallback. The dictionaries contain matching keys and interpolation slots; TypeScript checks call-site keys and parameters.
- Connected preferences use authenticated `GET/PUT /api/preferences` and the user's `HTMLEDIT_HOME/preferences.json`. Standalone mode uses origin-local storage. CLI priority is explicit `--lang`, saved manual preference, operating-system locale, then English. A one-time `open --lang` does not overwrite the saved preference.
- Language changes keep document state, selection, pending text/note input, history, and unsaved changes. Requests carry `Accept-Language`; errors retain stable codes plus message keys/parameters. The document language, user text, note text, filenames, identifiers, review version 1, and CLI JSON field names remain unchanged.
- Build and unit tests: **51 passed**. Full regression suite: **82 passed** across installed Windows Chrome and Edge. The new 18 browser cases cover all five languages for direct edit → note → save/copy → apply → automatic refresh → clean export, regional language detection, fallback, preference persistence across ports, failed preference saves, and retained inline/draft input. Existing browser tests explicitly use Korean.
- A follow-up focused run passed **18/18** after fixing duplicate restored diagnostics and stale preference-save notices. The legacy-draft test retains unknown diagnostic text and converts known Korean diagnostics. Test fixtures generated before this change continue to use review version 1.
- Package smoke test passed for 1.3.0: isolated Claude/Codex installation, version-pinned runtime, all five example/review-format files, translated CLI help, preference priority and temporary overrides, open/reuse, checkout/apply/backups, reinstall protection, stop and uninstall. Both skill format validators passed. No runtime dependency was added.

### Installed candidate: actual Codex desktop use

1. Packed and installed 1.3.0 in `.cache/release-1.3.0-live/user`, leaving the user's installed skills and existing document servers untouched. Opened a separate HTML fixture through that installed Codex skill runner, not the Vite development server.
2. In the in-app browser, directly edited a paragraph containing Korean, Japanese, Portuguese accents, and an emoji. Switched through all five UI languages and created one element-linked request in each language. Checked Japanese wrapping and longer Spanish/Portuguese controls.
3. Clicked **Save and copy AI request** without a separate working-file save. All five notes were written to the exact connected review file, and the clipboard request contained its exact path. User-authored text and the original document's `lang="fr"` were preserved.
4. This Codex desktop task read the installed skill and review-format reference, then used `status → checkout → edit candidate → apply → status`. All five requested heading changes were applied and only those notes were marked done. This was actual AI interpretation/editing in the current Codex task, not a separately launched Codex CLI process.
5. The already-open tab automatically displayed the five changed headings without a reload. The Portuguese note panel showed **Total 5 · Concluídas 5**. Downloaded final HTML and independently checked that identifiers, note JSON, and the AI handoff comment were absent.
6. Independent file checks confirmed the requested text, original document content, document language, direct edit, styles, note IDs/text/relations/targets/summaries, surviving element IDs, and a byte-identical pre-apply backup. The review still uses format version 1 and contains no locale setting.

After the final Korean help-text correction, the build, 51 unit tests, two focused legacy-draft browser cases, package smoke test, formatting and unused-code/type checks passed again. Reinstalled the final candidate in the isolated environment and reopened the review on a new port: the saved Portuguese selection and all five completed notes were retained. A byte-for-byte copy of the earlier 1.2.2 live-test review also passed checkout/apply with 1.3.0; this compatibility check used an unchanged candidate, not a new AI edit. Its source file was untouched.

Local evidence: `.cache/release-1.3.0-live/verification.json`, `before-ai.review.html`, `checkout.json`, `apply.json`, `workflow.edited.html`, `before-ai.png`, `after-ai.png`, `es-notes.png`, `ja-notes.png`, and `pt-BR-notes.png`. Authenticated connection URLs and agent logs are kept in ignored local files and must not be published.

### Separate Claude use: initial blocked attempts

The same five pending notes were copied to a separate test review. The installed 1.3.0 Claude skill was supplied to a real Claude Code invocation, with a Spanish request to follow checkout/apply and report in Spanish. Claude exited immediately with **Invalid API key · Fix external API key** before editing. The review bytes were unchanged. No authentication configuration was modified. After the user reported authentication recovery, one CLI retry still failed because the process selected its existing `ANTHROPIC_API_KEY`. The authenticated browser Remote Control session responded normally, so the test continued there.

The browser Claude read the installed skill and format, examined the five notes, verified the local package/runtime, and responded in Spanish. Its automatic approval classifier denied execution of the isolated runner with **Code from External**. The user explicitly approved this test-only scope; that approval was relayed verbatim, but the classifier denied `status`/`checkout` again. Claude stopped without applying any notes. Independent byte comparison at that point confirmed that the review was unchanged and all five notes were still pending. No global permissions or credentials were changed, and no alternate execution mechanism was used to bypass this denial.

At this point browser authentication and the Spanish response were verified, but checkout/apply and automatic refresh had not passed. The follow-up below resolved this test through the normal manual approval flow. Local evidence includes `claude-before-ai.review.html`, `claude-before-ai.png`, `claude-execution-approval.png`, and the updated `verification.json`. These are local validation artifacts, not a published release.

### Separate Claude use: successful manual-approval follow-up

**Result: passed.** The user personally switched the existing Claude Code Remote Control session to manual mode and had explicitly approved this test-only scope. Normal one-time approval prompts were reviewed for the exact fixture and returned candidate; no permanent allow rule, global permission setting, authentication change, or alternate command-execution path was introduced by Codex.

1. Claude used the isolated installed 1.3.0 runner through `run-claude.mjs` for `status → checkout → edit candidate → apply → status`. It independently interpreted the Korean, English, Spanish, Japanese, and Brazilian Portuguese notes. Only the returned candidate was edited, and apply used the original checkout revision.
2. All five requested heading changes were present and all five notes were marked done. The final response was in Spanish and correctly reported zero pending notes, the backup path, the actual checks, and that visual checking would be performed separately by Codex.
3. The editor tab had been opened before apply. Without reloading or reopening it, Codex observed all five changed headings and **Hay 0 solicitudes pendientes · Total 5 · Completadas 5**. The original French document language, multilingual direct edit, accents, and emoji remained intact.
4. Independent `verify-claude.mjs` assertions passed: exact heading text, original SHA-256, note IDs/text/relations/targets/summaries, surviving element IDs, styles, and byte-identical pre-apply backup. The resulting review SHA-256 was `4d565fa6ba0e87c0220709c8d074ec534c299b25fbaeb2bd646ed15cc8ec7bb0`, matching the independently produced Codex result. Before apply it was `32f713761f7322f3df3540b4552471c5b838f517400bb37bc067b7a7734b180a`.
5. Exported `claude.edited.html` through the Spanish editor and verified that all requested changes were present while editor IDs, note JSON, and the handoff comment were absent.

Local evidence in `.cache/release-1.3.0-live/`: `claude-verification.json`, `verification.json`, `claude-final-report.txt`, `claude-run-receipt.txt`, `claude-before-ai.review.html`, `claude-after-ai.png`, and `claude.edited.html`. The backup is `.htmledit/b04bd8fd5087ca99/backups/1791903725275-c80e3632-813d-44f0-b9bb-6318c73f8595.html` under that folder.

This validates the actual Claude Remote Control workflow in manual approval mode. It does not claim that the separate CLI API-key issue or Claude's automatic-mode classifier restriction was fixed. The application source did not change in this follow-up; full automated suites were not rerun for this documentation-only update. Verification assertions, documentation formatting, diff checks, and the candidate package inventory were checked again.

### Translation review and release boundary

Automated checks verified dictionary completeness, interpolation parity, Unicode handling, examples, and rendered workflow behavior. AI-assisted review checked terminology and repaired four truncated Korean help sentences found during visual inspection. **No native-speaker review was performed** for any added language; technical validation is not a linguistic quality certification. The shared glossary is in `docs/i18n/GLOSSARY.md`.

Windows Chrome/Edge remain the supported environment. Windows picker title/filter strings are localized; native OS button labels follow Windows settings. No macOS/Linux support claim is added. The Vite build reports a non-fatal size advisory for the bundle containing all five dictionaries (about 562 kB minified, 169 kB gzip).

The planned local implementation and functional validation were completed, including both actual AI workflows, before publication was authorized. The release follows main CI → `v1.3.0` tag push → trusted publishing → npm/GitHub artifact verification. Never publish locally with `npm publish`.

### Release preparation (2026-10-14 KST)

The user authorized publication after the successful Claude follow-up. The first [main CI run](https://github.com/ChiwooSong/htmledit/actions/runs/38419659824) passed build, formatting, unit tests, and 81 of 82 browser cases. One preference-persistence test attempted its first file read before the asynchronous initial save created `preferences.json`. Its poll now treats only `ENOENT` as not-yet-ready and still requires the exact saved language; other errors propagate. The focused case passed three times per browser (6/6). Application code and validation assertions were unchanged. Publication remains gated on the complete main CI run after this test correction.

### 1.3.0 publication receipt (2026-10-14 KST)

- Release commit: `67fe74e753ae3e9ef11e6650d21e17151694cb33`. The [main Windows CI](https://github.com/ChiwooSong/htmledit/actions/runs/38420823868) passed build, formatting, 51 unit tests, 82 Chrome/Edge browser tests, and packaged installation/workflow validation before the `v1.3.0` tag was pushed.
- The [tag-triggered Release workflow](https://github.com/ChiwooSong/htmledit/actions/runs/38421665331) passed both publish and release jobs. Publication used GitHub Actions OIDC trusted publishing; no local `npm publish` was used.
- Registry metadata confirmed `@woody_s/htmledit@1.3.0`, `latest: 1.3.0`, and `_npmUser.name: GitHub Actions` with a GitHub trusted publisher. The provenance statement identifies `.github/workflows/release.yml`, `refs/tags/v1.3.0`, the exact release commit, and this Actions run.
- The [GitHub release](https://github.com/ChiwooSong/htmledit/releases/tag/v1.3.0) contains `woody_s-htmledit-1.3.0.tgz` and `SHA256SUMS`. Independently downloaded GitHub and npm tarballs were byte-identical, and the registry SHA-1/SHA-512 integrity values and attached SHA-256 checksum matched.
- Tarball SHA-256: `8257155910d31a903f4630c8c3e4718a0873c8c4b128738ee83dedf12c79beba`.

Local publication evidence is in `.cache/release-1.3.0-published/`: `published-verification.json`, `registry-metadata.json`, `attestations.json`, the registry-matched release tarball, and `SHA256SUMS`. This receipt is a post-release documentation update; the published package and tag remain tied to the release commit above.

## 1.4.0 platform candidate verification (2026-10-14 KST)

**Implementation and automated platform checks passed. Native dialog completion, actual Safari use, and native AI reflection are still pending user interaction/authentication. This is an unpublished candidate, not a claim of complete Linux/macOS support.**

### Environment and baseline

| Environment                           | Runtime / browser                                               | Result                                                                                       |
| ------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Windows                               | Node 22.17.0; Chrome 154.0.8037.95; Edge 155.0.4283.45          | Build, 64 unit tests, 82 browser tests, package lifecycle passed                             |
| Ubuntu 24.04.3, WSL2/WSLg, x64        | Isolated Node 22.23.3; Linux Chrome 155.0.8059.79; zenity 4.0.1 | Build, 64 unit tests, 41 Chrome browser tests, package lifecycle passed                      |
| Physical MacBook, macOS 15.6.1, arm64 | Isolated Node 22.23.3; Chrome 155.0.8059.40                     | Build, 64 unit tests, 41 Chrome browser tests, package lifecycle passed                      |
| Same MacBook                          | Safari 18.6                                                     | Pending: native WebDriver requested Allow remote automation; no Safari workflow pass claimed |

The published 1.3.0 package was installed in isolated homes on both Ubuntu and Mac. Both installed Claude/Codex skills, opened and read a Unicode-path HTML document, and stopped/uninstalled successfully. Both returned `PICKER_UNSUPPORTED` from authenticated native document selection, reproducing the Windows-only limitation. These were baseline checks, not complete 1.3.0 platform certifications.

Node archives came from the official Node distribution and their SHA-256 values were checked against `SHASUMS256.txt`. Existing global Node, skills, authentication, and signal_flare files/processes were left intact. Ubuntu received Chrome, zenity, and xdg-utils with their system dependencies. Test runtimes, profiles and documents are under each user's `htmledit-platform-1.4.0` directory. WSL-native Chrome tests are distinct from Windows-browser access to a WSL server; no general Linux desktop certification is inferred.

### Implementation and regression evidence

- Added macOS osascript and Ubuntu zenity file pickers. Titles/filters travel as arguments or environment variables, never interpolated source. Tests distinguish cancellation, missing tools, missing desktop, native errors and timeouts, and preserve Unicode, quotes and path whitespace. Existing authenticated selection still accepts no browser-supplied filesystem path.
- Shared browser launch handling covers Windows, macOS and Linux, nonzero exit status, missing commands and timeouts. Headless use retains `--no-browser` and returned loopback URLs. The standalone start command uses the same launcher.
- Mac package smoke testing exposed a real reinstall bug: `/var/...` and `/private/var/...` compared unequal even though they named the same runtime. Installation now compares real paths before copying. A directory-alias reinstall case was added and passed on all three OSes, including Windows junctions.
- Chrome tests on the physical Mac exercised Cmd-based undo/redo via `ControlOrMeta`; IME composition, Unicode, image replacement, metadata, save conflicts, preferences and all five locale workflows remain covered by the existing browser suite. Automated composition events are not a claim of manually verified OS IME input.
- The first Windows run had 81/82 passing with an Edge scenario timing out while WSL tests were also active. That scenario passed 3/3 in isolation, and the full final-code run passed 82/82 with two workers. No product assertion or timeout was relaxed.
- Both updated skills passed the skill format validator. The test package contained 41 files and passed install, persistent runtime, open/reuse, checkout/apply/backup, normal and alias reinstall, modified-skill protection, stop and uninstall.
- Byte-preserving copies of actual 1.2.2 and 1.3.0 review fixtures each passed open → checkout → unchanged candidate apply → status on both Ubuntu and Mac. Files and backups matched byte-for-byte. These compatibility checks were not AI interpretation tests.
- CI configuration now includes Windows, Ubuntu 24.04 and macOS 15, preserving the Windows check name. Chrome runs on all targets and Edge additionally on Windows. The new GitHub matrix has not been pushed/run yet; local native-OS results are recorded separately.

### Real-use gates and artifact identity

Installed the same candidate tarball in isolated homes on both machines and started visible native Chrome sessions. The Mac native HTML dialog was observed through Chrome Remote Desktop. Cancel/select completion is awaiting user interaction; Windows Computer Use failed initialization, and Mac accessibility automation was not enabled. The live harnesses reached their five-minute response timeout before user interaction and must be reopened for the follow-up. This is not a native picker selection/cancellation pass. No accessibility setting was changed. Safari remote automation is also awaiting the user's setting choice or manual testing. Neither WebKit nor Chrome results count as Safari evidence.

Claude Code 2.1.296 is installed in each test directory with separate `CLAUDE_CONFIG_DIR` profiles. At the last check neither test profile was authenticated. Login was requested from the user; no native Claude/Codex interpretation or AI reflection pass is claimed yet. Authentication keys/codes must not be included in evidence.

The tested application source started from `4a6e788d95eee8f0a048544751cc7e9e7678a539` plus the uncommitted 1.4.0 changes. The transferred source archive SHA-256 was `136f45f3f306989244cd81bbe0313f7b2156f3c910e9601d03287c451caac474`. The installed live-test tarball SHA-256 was `1aab9240f4a198166f372dbeab5168039e323ef8b06609210f8ec729a3b567f3`. Later documentation-only edits are not part of that tarball; any final candidate must be repacked and its hash recorded after the remaining gates pass.

Local evidence is under `.cache/platform-1.4.0/`, including `linux/` and `mac/` build/unit/browser/package logs, baseline and compatibility JSON, the source archive and candidate tarball. Remote live-stage and connection files stay inside the isolated test directories; connection URLs are credentials and are not published. Existing historical results above remain unchanged. No tag push or npm publication was performed for 1.4.0.

## Image insertion candidate — 2026-10-14

This is an additive feature on the uncommitted 1.4.0 platform candidate, based on commit `4a6e788d95eee8f0a048544751cc7e9e7678a539`. No release version was changed, no tag was pushed, and nothing was published. The earlier platform verification and its outstanding manual gates above remain separate.

### Behavior and compatibility

- Added element-relative image insertion (before, after, or last child), with a preview-only document copy and a position marker. Apply commits one undo step and selects the new image. Cancellation, rejected input and stale asynchronous reads do not insert content into the working document.
- Local file selection, panel-scoped drag/drop and image paste, and credential-free HTTP/HTTPS image downloads share MIME/signature/decode validation. PNG/JPEG/WebP/GIF are embedded without recompression. Limits remain 10MB per image and 25MB per exported HTML, including base64 expansion. Downloads stream with a byte limit and a 15-second timeout; there is no server proxy or automatic external-link fallback.
- Added original/percentage width, alignment and alternative text controls. Replacement shares the input panel and preserves existing layout styles, while still clearing responsive sources. Unsupported insertion parents are disabled instead of silently relocating images. Review metadata remains version 1 with the existing element/note IDs and checkout/apply contract.
- Image drafts participate in the existing pending-input guard for AI-request copying, connected document switching and external-result refresh. They do not change the saved file or undo history until applied. Five UI catalogs and user guides cover the feature. Translations were implementation-reviewed, not native-speaker reviewed.

### Automated evidence

| Environment                          | Runtime and browser                                    | Result                                                                                   |
| ------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Windows x64                          | Node 22.17.0; Chrome 154.0.8037.95; Edge 155.0.4283.45 | Build, 78 unit tests, 96 browser tests, package lifecycle and format check passed        |
| Ubuntu 24.04.3 WSL2 x64              | Isolated Node 22.23.3; Linux Chrome 155.0.8059.79      | Build, 78 unit tests, 48 browser tests, package lifecycle passed                         |
| Physical MacBook, macOS 15.6.1 arm64 | Isolated Node 22.23.3; Chrome 155.0.8059.40            | Build, 78 unit tests, 48 browser tests, package lifecycle passed                         |
| Same MacBook                         | Safari 18.6                                            | Not verified: WebDriver rejected the session because Allow remote automation is disabled |

The image browser cases cover discardable preview and export isolation, insertion/undo/redo, note/export/reopen, URL bytes and failures, paste/drop routing, invalid positions, stale downloads after target change, all five locales during input, all four image formats, subsequent presentation edits and style-preserving replacement. A real Clipboard API write followed by Ctrl/Cmd+V passed in Windows Chrome/Edge and native Linux/Mac Chrome; synthetic paste/drop event coverage is recorded separately from that API/keyboard test. Browser runs used headless vendor Chrome/Edge binaries; they do not establish manual WSLg or native dialog behavior. File-input automation is not a claim of manually operating the operating-system picker. No Safari/WebKit equivalence is claimed.

Unit cases cover insertion structure, round trips, note orphaning/restoration, clean export, invalid types/positions/widths, image byte signatures, unsupported URLs, MIME mismatch, file/download size limits with and without Content-Length, network/HTTP failures and timeouts. The deliberate 25MB parse test exceeded the default five-second test deadline under concurrent platform load; it has a case-specific 15-second budget with the same size and assertions. The download timeout itself remains 15 seconds.

Early browser runs exposed missing explicit select labels and outdated test selectors; those were corrected. A tiny historical PNG fixture rendered in an img element but was rejected by Chromium's Clipboard API decoder; the real clipboard test now uses a valid canvas-encoded PNG. A concurrent Windows/WSL run reused the same forwarded development port and lost its server after WSL finished; the final Windows suite ran independently with CI server ownership and passed all 96 cases. Initial remote transfer also omitted index.html; the archive was corrected before the successful native runs. None of these incomplete runs is counted as a pass.

### Actual Codex interpretation and apply

The current Codex agent used the candidate's bundled htmledit skill runner on a dedicated test document. Browser automation inserted a generated PNG, added a Korean request for 60% width, center alignment and 24px top spacing while preserving image data/alt text, then saved and copied the AI request. The agent read status, checked out the candidate, read the target and note, edited only the returned candidate and marked only that fulfilled note complete, then ran apply and status. This was an actual Codex interpretation step, not a scripted DocumentStore simulation; it was performed from Windows, not by a separately authenticated native Linux/Mac AI CLI.

The connected Chrome page refreshed without reopening the file. The result was inspected visually and asserted for the new width/spacing, byte-identical image source, unchanged alternative text and original HTML, one completed note, and a clean export containing the image but no editor IDs or review block. The apply backup matched the pre-apply review byte-for-byte: SHA-256 `f5fcdc85bbef3eb1945efd77f62f643eafcd6f9e3be732ee5ffcaf2c35a4295c`. No user document was modified.

### Evidence and remaining checks

Local evidence is under `.cache/images-verification/` (Windows browser/package logs, source hashes and `live/` before/after screenshots, candidate/apply receipts and clean export). Native logs are in each dedicated `htmledit-platform-1.4.0/images-20261014-a266/evidence` directory. Existing platform test directories, global skills, authentication and signal_flare processes were preserved. Connection files contain edit tokens and remain ignored/private.

The application source digest is `d6860f769b6cfcc6d38a93babaed5bcab5e43ea5343640d08e44e3dc1b4a49cf`: SHA-256 over sorted POSIX src file paths, each followed by NUL and its raw bytes; the per-file manifest is retained locally. The native browser runs used this same application source. The final unit-only timeout adjustment was copied to both native environments and their unit suites rerun successfully.

Pending manual gates: actual Safari behavior after the user enables remote automation or performs manual checks, and manual native image file-picker operation. Previous 1.4.0 platform gates (native document-picker interaction and separately authenticated native AI sessions) remain unfulfilled unless separately recorded. These pending items prevent treating this record as complete cross-platform release certification.

### Release CI stabilization — 2026-10-15

The first main CI run ([38584310586](https://github.com/ChiwooSong/htmledit/actions/runs/38584310586), commit `42a90d5`) passed Windows and Ubuntu but failed four macOS browser cases. Traces showed two complete-flow cases exhausting the overall 30-second deadline under four-worker contention. The recovery case accepted the initial document's autosave timestamp before the new note transaction completed. The visual round-trip comparison differed only at two faint blue edge pixels on the link (RGB 248/248/255 versus white), with unchanged image dimensions and layout.

CI now uses two workers, matching the previously validated local runs. Recovery waits for the expected note in IndexedDB, and visual comparison waits for fonts and image decoding before both captures. Test deadlines and exact screenshot equality are unchanged. The four affected scenarios passed on Windows Chrome/Edge (8 cases) and twice on the physical Mac's Chrome (8 cases). Type checking and formatting also passed. These changes affect test synchronization only; the application source digest above is unchanged.

The second CI run ([38585770911](https://github.com/ChiwooSong/htmledit/actions/runs/38585770911)) passed those four cases, but a separate full-page example comparison exposed macOS compositing variation. Ten repeated runs on the physical Mac reproduced it once, even after consecutive stable captures. Decoded PNGs were both 1440 × 1225: 5,979 pixels differed by one channel level and one pixel by three, with no other differences. That full-page comparison now checks equal dimensions and every decoded RGBA channel with a maximum delta of 3/255; it does not allow missing or shifted regions. Both PNGs are retained as test artifacts. The iframe comparison remains byte-exact. The revised full-page case passed ten repetitions on Mac Chrome and both Windows browsers. No runtime code changed.
