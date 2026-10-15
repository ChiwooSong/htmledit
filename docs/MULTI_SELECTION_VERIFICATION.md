# Multi-selection and immediate deletion — development verification

Date: 2026-10-15 (Asia/Seoul). Feature verification began on working-tree changes based on `92d62cbc19fe9ad598ec7f7aa7ca944b8cfa2410` (1.4.1). The user subsequently requested publication as a new release; these changes are prepared as 1.5.0. Publication receipts belong in the GitHub v1.5.0 release notes after the tag workflow completes.

## Behavior

- Ordinary click replaces the selection. Ctrl+click or Cmd+click toggles individual elements in both direct-edit and note modes. Every selected element has an outline.
- Delete removes the entire selection without confirmation. The delete buttons use the same operation. One undo restores all removed elements, including overlapping parent/child selections. Notes and an unfinished note request remain available.
- Delete does not remove document elements from text inputs, inline editing, dialogs, image editing or Interact mode. The document body is protected. Multiple selection exposes joint notes and batch deletion; text, style and image editing require one selected element.
- One joint note has one ID, request and completion state. Every target shows the same note number. The list exposes all targets, partial/all missing targets and reassignment to the current selection.
- Single-target files retain review v1. Files containing joint notes use review v2 with an ordered `targets` array. Existing `targetId`/`target` mirror its first entry. Older editors reject v2 instead of silently dropping targets. Both the editor and the AI runtime need an update before using these files together.
- AI apply must preserve all target IDs, summaries, order, note text and relation. Pending notes cannot lose targets; completed deletion requests may. AI request copies and HTML handoff comments explain whole-group completion. Clean export strips metadata for both versions.

## Automated evidence

Environment: Windows 11 Home, build 10.0.26200, Node 22.17.0, Chrome 155.0.8059.79, Edge 155.0.4283.45.

- Build and TypeScript: passed.
- Vitest: 82 tests passed, including atomic batch deletion/undo, joint-note round trips, v1 compatibility, malformed groups, duplicate IDs, missing targets, reassignment and apply validation.
- Full Chrome/Edge browser regression: 114 tests passed. Existing deletion-button tests now assert absence of a confirmation dialog.
- After the final handoff-copy and summary-preservation changes, the 16 focused Chrome/Edge cases passed again. These cover all five UI languages, Ctrl and simulated Meta clicks, selection toggling, input retention across language changes, one shared note, review/final downloads, reopen, Delete/undo/redo, inline/sidebar/note input protection, body protection, partial missing targets and reassignment.
- Connected browser tests exercised saving/copying, candidate checkout, the AI apply validation path, exact backup preservation and automatic refresh. The source document stayed unchanged.
- A separate built CLI exercise passed `status → checkout → edit candidate → apply → status` with a v2 joint note, both removed target IDs retained and the exact prior bytes in the backup.
- Formatting checks passed. Screenshot inspection confirmed both outlines, shared note numbers, the selected-target summary and the joint note list in the Korean UI.
- Package smoke passed from a packed tarball: both skill installs, pinned runtime, open/reuse, checkout/apply/backup, reinstall, modified-skill protection, stop and uninstall. The source package version remains 1.4.1 for this unreleased development test.

Local ignored evidence is under `.cache/multi-selection/`: `regression.log`, `browser-final.log`, `unit-final.log`, `build-final.log`, `format-check.log`, `joint-note-chrome.png`, `joint-note-edge.png`, and the isolated CLI exercise. A separate example document and isolated local editor were prepared for user testing; no existing user document or installed skill was changed.

## Actual Codex joint-note application

This interactive Codex session processed a request the user saved in the test editor, independently of the deterministic automated fixtures above.

- The saved request was `셔로 위치 바꿔` (swap their positions). It linked `h1` **함께 선택하고, 하나의 메모로** and `h2` **제품 소개** in one v2 note, `he-77545d46-fead-44af-91c1-a84793ec2e17`.
- The installed skill was still pinned to 1.4.0 and reported the unsupported metadata version. It did not overwrite or discard the notes. The matching development skill runner was used for this test; the user's existing installation was not replaced.
- `status` found one pending joint note with both targets present. `checkout` produced a separate candidate. Codex interpreted the request and swapped the two actual HTML elements between the header and first article, retaining their tags, text, IDs and styles. Only this note's `done` field changed to `true`; its entire ordered `targets` list, summaries, request and relation were preserved.
- A reverse-swap comparison confirmed all other candidate bytes and metadata were unchanged. `apply` used the checkout revision and produced a backup. Post-apply `status` confirmed one completed note, zero pending notes, both original target IDs present and no missing targets.
- The backup SHA-256 exactly matched the checkout revision: `d5609e02e57bab4e4ec9e8dafc0d9c0929c503b946e04e00a1d153a18ff24551`. Applied review SHA-256: `bee6db4caa1cac90d1f7a853b22f4a830822a0fe3448cf42a707eb6dea0409a8`.
- Chrome rendered the applied file. DOM assertions and screenshot inspection confirmed **제품 소개** in the header, the original `h1` in the first article, and **사용자 가치** unchanged in the second article. This was a separate rendering check, not an independent observation of the already-open in-app tab's automatic refresh.

Ignored local evidence: `demo.review.html`, `apply-user-note.mjs`, `verify-user-note.mjs`, `user-note-applied.png`, and the checkout/backup directories under `.cache/multi-selection/`. No authentication URL or token is included in this record. This verifies actual Codex interpretation of one joint request on the development candidate; it does not establish Claude or unattended AI execution support.

## Limits

Release CI initially passed Ubuntu, but seven new macOS browser cases failed at multi-selection because the test sent literal Control+click. macOS treats that chord as a secondary click; the documented application shortcut is Cmd+click. The tests now use Playwright's `ControlOrMeta` modifier (Control on Windows/Linux, Meta on macOS) for the primary workflow and undo/redo. The explicit Meta-click coverage remains. This corrects the OS input in the tests without changing application selection behavior; the final release is gated on CI for the corrected commit.

The candidate edits in the automated and CLI checks were deterministic test transformations; the separate actual Codex application is recorded above. Native macOS Cmd+click, Safari and Linux desktop use were not manually rerun for this feature; Meta-click simulation on Windows is recorded separately. Five-language functional checks are not native-speaker translation review. Release CI on Ubuntu/macOS is separate from native desktop/Safari verification.
