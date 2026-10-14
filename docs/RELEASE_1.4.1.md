# HTMLEdit 1.4.1 — Table-of-contents navigation fix

Clicking a table-of-contents link such as `#section` in Interact mode could navigate the preview frame to the editor's localhost address, replacing the document with a connection or frame-loading error. HTMLEdit now scrolls to the target inside the document. Switching back to Edit directly keeps that scroll position.

- Supports element IDs, percent-encoded IDs, legacy named anchors and empty/top fragments. Missing targets leave the document open.
- Preserves the document's links when saving. External navigation restrictions and iframe isolation remain in place.
- No review-format, file-path or checkout/apply changes. Documents and notes do not need migration.

## Update

```sh
npx --yes @woody_s/htmledit@1.4.1 install --agent all
```

Use `--agent claude` or `--agent codex` to update one skill. Save your work and reopen the editor in a new session after updating; an already-running server keeps its loaded runtime. Originals, review files and backups are preserved.

## Verification

Local build, formatting and 78 unit tests passed. Chrome and Edge passed 10 interaction cases plus two connected-frame API isolation cases. An actual nine-section document was checked in Edge: every table-of-contents link scrolled correctly, and returning to direct editing preserved the current section. The user's private document is not included in the repository.

The platform scope remains unchanged: Windows Chrome/Edge are primary; Linux/macOS remain experimental, with the previously documented manual Safari/native-picker checks outstanding. Publication uses the existing tag-triggered GitHub OIDC trusted-publishing workflow.
