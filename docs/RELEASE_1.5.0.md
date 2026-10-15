# HTMLEdit 1.5.0 — Joint notes and immediate deletion

Select several elements with **Ctrl+click** (or **Cmd+click**) and leave one request covering the entire group. Every target shows the same note number. For example, select two headings and ask the AI to swap their positions.

- Click normally to select one element; Ctrl/Cmd+click adds or removes targets.
- **Del** deletes the selected elements without confirmation. **Ctrl/Cmd+Z** restores the entire deletion in one step. The delete buttons use the same behavior. Text inputs, inline editors, dialogs and Interact mode are protected from element deletion.
- Joint notes retain all target IDs, expose missing targets and can be reassigned. AI apply preserves the entire target list and only completed requests should be marked done.
- Multiple selection supports joint notes and batch deletion. Text, color, size and image editing continue to use one selected element.
- UI, error messages, AI request text and documentation cover all five existing languages.

## Compatibility and update

Single-target reviews continue to use **review v1**. Files containing joint notes use **review v2**. Older runtimes explicitly reject v2 rather than silently dropping targets. Update both the editor runtime and the skills that process its notes:

```sh
npx --yes @woody_s/htmledit@1.5.0 install --agent all
```

Run this outside the HTMLEdit source checkout. Use `--agent claude` or `--agent codex` to update one skill. Save current work, stop the old editor session when finished, and reopen with the updated runtime. Existing servers keep their loaded code until restarted. Original documents, review files, candidates and backups are preserved. HTML containing only v1 notes remains compatible with previous releases; a v2 file requires the new runtime. Final HTML exports remove either metadata version.

## Verification

Local checks: build and formatting, 82 unit tests, 114 Windows Chrome/Edge regression cases, 16 final focused cases across five languages, built CLI v2 checkout/apply and package lifecycle smoke. An actual user-created joint note was interpreted by this Codex session: two heading elements were swapped, both IDs and the entire note were preserved, only the fulfilled request was completed, and backup bytes and Chrome rendering were verified. See [the detailed evidence and limits](MULTI_SELECTION_VERIFICATION.md).

The platform scope is unchanged. Windows Chrome/Edge remain primary; Linux/macOS launchers and pickers remain experimental. CI runs on Windows, Ubuntu 24.04 and macOS 15. These automated checks do not substitute for native Safari, native file-picker interaction, or a new actual Claude verification. Publication uses tag-triggered GitHub OIDC trusted publishing; no local npm publish is required.
