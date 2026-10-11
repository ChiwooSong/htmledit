# AI 전달 형식 v1

전달용 HTML의 `script#htmledit-review[type="application/json"]`는 실행되지 않는 메모 블록입니다. 문서 head에 저장되며 화면에 표시되지 않습니다. `HTMLEdit AI HANDOFF v1` 주석에 같은 파일의 처리 안내가 있습니다.

```json
{
  "version": 1,
  "notes": [
    {
      "id": "he-unique-note-id",
      "targetId": "he-unique-element-id",
      "relation": "before",
      "text": "이 제목 앞에 집 모양 아이콘을 추가해 주세요.",
      "done": false,
      "target": { "tag": "h3", "excerpt": "주거 공간 디자인" }
    }
  ]
}
```

- `targetId`는 `[data-htmledit-id="해당 값"]` 요소를 가리킵니다. `self`는 이 요소, `before`는 앞, `after`는 뒤, `inside`는 안쪽입니다.
- `id`와 `targetId`는 영문·숫자·하이픈·밑줄로 이루어진 1~100자 식별자입니다. 기본 생성은 UUID를 사용합니다.
- 메모 ID는 문서 안에서 고유해야 합니다. 요청은 최대 20,000자, 메모는 최대 5,000개입니다.
- `target`은 사람이 요청을 이해할 수 있는 보조 요약입니다. 대상을 연결하는 기준은 `targetId`입니다. 요약만으로 임의 연결하지 않습니다.
- `done:false` 요청을 적용하고, 반영한 요청만 `done:true`로 변경하세요. 다른 메모와 기존 대상 식별자는 보존하세요.
- ID가 없거나 중복이면 임의 적용하지 말고 사용자에게 확인하세요. 삭제 요청을 완료한 경우 해당 대상 ID가 없어져도 완료 메모를 남길 수 있습니다.
- JSON의 `<`, `>`, `&`는 유니코드 이스케이프로 저장합니다. 메모의 `</script>`가 저장 블록을 종료하지 않아야 합니다.
- 손상된 메모, 알 수 없는 버전, 중복 블록을 가져오면 저장을 막고 명시적인 메모 제외 선택을 요구합니다. 중복 대상 ID는 새 ID로 바꾸며 기존 요청은 대상 없음 상태로 남깁니다.
- 완성본에는 메모 블록·안내 주석·`data-htmledit-id`가 포함되지 않습니다.

이 형식은 외부 AI가 HTML을 읽는 방식에 의존하며, 앱이 AI 호출이나 결과 자동 판정을 수행하지 않습니다.
