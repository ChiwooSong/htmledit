# 보안 정책 · Security Policy

## 지원 버전

최신 1.x 릴리스만 보안 수정을 받습니다. 이전 버전은 README의 최신 설치 명령으로 갱신하세요.

## 취약점 신고

GitHub의 비공개 취약점 신고로 알려 주세요: <https://github.com/ChiwooSong/htmledit/security/advisories/new>. 공개 이슈에는 재현 방법을 올리지 마세요. 확인된 문제는 수정 버전과 함께 공개합니다.

## 위협 모델과 범위

- 연결 서버는 `127.0.0.1`의 무작위 포트에 바인딩합니다. 세션별 무작위 토큰과 Host·Origin 검사를 통과한 요청만 지정된 작업 파일 하나를 읽고 씁니다.
- 직접 편집·메모 모드는 문서 스크립트를 실행하지 않습니다.
- 문서 조작 모드는 문서 스크립트를 출처가 분리된 샌드박스 프레임에서 실행합니다. 이 프레임은 편집기 화면·브라우저 저장 공간·연결 토큰에 접근할 수 없습니다. 다만 문서 스크립트는 조작 중인 화면의 편집 내용을 읽을 수 있고, 외부 이미지·스타일 요청이나 프레임 자체의 주소 이동으로 외부 주소에 데이터를 보낼 수 있습니다. 브라우저 샌드박스로 막을 수 없는 설계상 한계이므로 신뢰할 수 없는 문서에서는 조작 모드를 사용하지 마세요. 이 한계 자체는 취약점으로 접수하지 않습니다.
- 사용자가 자기 PC에서 자기 파일에 대해 하는 동작, 같은 사용자 계정으로 실행 중인 다른 프로그램의 접근, AI 서비스 측의 데이터 처리는 범위 밖입니다.

## English

Report vulnerabilities privately through GitHub: <https://github.com/ChiwooSong/htmledit/security/advisories/new>. Do not post reproduction steps in public issues. Only the latest 1.x release receives fixes.

The local server binds to a random port on `127.0.0.1` and serves one working file to requests that carry the per-session token and pass Host and Origin checks. Document-interaction mode runs document scripts in a sandboxed frame that cannot reach the editor, its storage or the connection token. Those scripts can still observe in-session edits and reach external hosts through image or style requests or by navigating the frame, so use that mode only with trusted documents. This is a known design limit, not a reportable vulnerability.
