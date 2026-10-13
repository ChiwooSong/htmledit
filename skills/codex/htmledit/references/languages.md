# Localized controls

Respond in the user's language and refer to the exact label below. If the editor language is unknown, explain the action and mention the English label; do not assume it is Korean. The language menu uses native language names and offers Automatic.

| Locale | Save and copy AI request           | Save working file          |
| ------ | ---------------------------------- | -------------------------- |
| ko     | 저장하고 AI 요청 복사              | 작업 파일 저장             |
| en     | Save and copy AI request           | Save working file          |
| es     | Guardar y copiar solicitud para IA | Guardar archivo de trabajo |
| ja     | 保存してAIへの依頼をコピー         | 作業ファイルを保存         |
| pt-BR  | Salvar e copiar pedido para IA     | Salvar arquivo de trabalho |

`open <file> --lang ko|en|es|ja|pt-BR` sets the initial editor language for that opening. Omit it when the user has not requested an override. Manual choices are saved by the editor; UI changes never translate the user's document or notes. CLI commands, JSON keys and review format v1 stay language independent. Installed user guides are under the pinned runtime's `docs/i18n/` folder.
