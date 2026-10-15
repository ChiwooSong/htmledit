# Safari fixes integrated with 1.5.0 — 2026-10-15

## Candidate and scope

The Safari selection, save/copy and scrolling fixes are integrated with **v1.5.0**, commit `1682a9a2894a7d9271d5d4306de4cc6535bc5989`. This supersedes the integration gap documented in [the earlier 1.4.1-based investigation](SAFARI_VERIFICATION.md). The old candidate, original development checkout, other worktrees and published package were preserved.

These checks used an **unpublished candidate**, retaining manifest version 1.5.0 for isolated testing. The installed test tarball SHA-256 is `e6747c12707e78ec7f6260319f7d1366876a71d6ab69e1955ac5879fdb3db040`, independently matched on Windows, Ubuntu and Mac. Subsequent verification-document additions and test formatting are not part of that tarball; runtime code is unchanged. No publication occurred during these checks. Following user approval, the same runtime fixes are being released as [1.5.1](RELEASE_1.5.1.md); release verification is recorded separately from this candidate evidence.

## Integration decisions

- Preserve 1.5.0 Ctrl/Cmd additive selection, joint-note target arrays, batch deletion and review-v1/v2 handling.
- Use parent-owned pointer and keyboard handling only when the preview document rejects parent listeners. Retain `sandbox="allow-same-origin"`; do not enable document scripts in editing mode.
- Preserve 1.5.0 IME, inline-editor and text-input guards. Stop propagation for handled Delete and undo/redo events so the parent window cannot handle them a second time.
- Keep modifier double-click protection, multiple selection outlines, and one numbered note marker on each joint target.
- Start clipboard writes during the click gesture, but supply their text only after saving and pending-input/revision checks succeed. Preserve 1.5.0's joint-note handoff instructions.
- Bound Home/End scrolling by actual element dimensions to avoid Safari's large-value wrapping.

## Automated checks

| Environment                    | Build / unit tests | Browser regressions    |
| ------------------------------ | ------------------ | ---------------------- |
| Windows                        | Passed; 86/86      | Chrome + Edge: 132/132 |
| Ubuntu 24.04.3, WSL2/WSLg, x64 | Passed; 86/86      | Linux Chrome: 66/66    |
| macOS 15.6.1, Apple Silicon    | Passed; 86/86      | Chrome: 66/66          |

The full suites retain existing multi-selection tests covering five languages, v2 round trips, joint-note reassignment with missing targets, batch deletion, one-step undo/redo, protected inputs, checkout/apply, backups and automatic refresh. Nine additional preview-event tests per browser exercise the Safari fallback, including joint notes and deletion in all five languages. Four clipboard unit tests cover save sequencing, cancellation, early permission failure and legacy fallback.

Package lifecycle smoke passed with 48 packaged files: both skill installs, pinned runtime, open/reuse, checkout/apply/backup, reinstall and directory aliases, modified-skill protection, stop and uninstall. Formatting and `git diff --check` passed. Vite retained its existing bundle-size advisory; builds succeeded.

## Installed-candidate real-browser and AI checks

All isolated installations live under `~/htmledit-platform-1.4.0/integration150/` with separate `HTMLEDIT_USER_HOME` and `HTMLEDIT_HOME`. The historical directory name does not indicate the installed version. Ubuntu and Mac use Node 22.23.3 and authenticated native Claude Code 2.1.296.

| Actual browser              | Version       | Joint-note workflow |
| --------------------------- | ------------- | ------------------- |
| WSLg Linux Chrome           | 155.0.8059.79 | Passed              |
| Mac Chrome                  | 155.0.8059.40 | Passed              |
| Mac Safari via SafariDriver | 18.6          | Passed              |

Each browser independently performed:

1. Select two headings with Ctrl/Cmd+click, toggle a target off/on, delete both without a dialog, then undo/redo/undo.
2. Write one multilingual joint note asking to swap the two complete heading elements. Switch all five UI languages while preserving both targets and the pending request.
3. Save and copy the AI request; verify review `version:2`, two targets, two markers carrying the same number, and the exact review path plus `targets` instructions in the clipboard.
4. Delete and undo the group while retaining its joint note, save, and reopen the review with both markers restored.
5. Actual Claude reads the installed skill and follows `status → checkout → candidate-only edit → apply --revision → status`. All three independent runs fulfilled their one joint note, preserved the complete ordered target list and marked only that note done. No permission bypass or permission denial occurred in these runs.
6. Observe automatic refresh in the already-open editor. Independently verify the swapped order, surviving IDs, unchanged note metadata except completion, source bytes, language, nested emphasis, blocked script execution, and a byte-identical pre-apply backup.
7. Download final HTML and verify its changed element order and absence of editor IDs/review metadata. Safari's native download prompt was handled and the downloaded file was recovered from Downloads.

Final working-file SHA-256 values, before any later manual edits:

- WSLg Chrome: `8b89cd3e9bd85afdef32e45bde5dc0f4e6f3f5dfdc151906246e305b87f5c9a3`.
- Mac Chrome: `3cb40128562635ab2660f8c907d3b84877c28036c52620cddc8220b6624e778d`.
- Safari: `a38a64a55245ab2d833ae20f4b4f8109f5e54cf96b4e7654abdda1edd45bca3a`.

Actual Safari additionally passed nested keyboard and native wheel scrolling, PageDown/Home, marker movement and mobile-width positioning, all five UI languages with a pending note, document-language preservation, injected failed-save/conflict clipboard protection, recovery to successful copy, and image insertion/replacement/undo/redo/save/reopen/final export. Safari evidence is from the physical Mac, not Playwright WebKit.

## Harness corrections and evidence limits

The first Chrome live harness attempted successive keyboard actions before the replacement iframe finished loading. Waiting for document readiness and the following render frames made the UI sequence reliable. After successful AI application and observed refresh, an overly strict string assertion expected `<strong>` without HTMLEdit's legitimate target attribute. The verifier was corrected to allow attributes, and the preserved artifacts, backups and export were checked without re-running the AI or rewriting its result. These were harness corrections; no application change was made after the tested tarball was installed. The final Safari joint workflow passed end to end in one run.

The earlier candidate's manual Safari click/double-click and real Korean IME input/apply confirmations on Safari and WSLg remain historical evidence. They were not presented as new manual confirmations on this candidate. Native file-picker interaction was likewise previously confirmed and was not repeated; picker code is unchanged. Safari image files were provided using WebDriver's file-input protocol. Linux test results are specific to WSL2/WSLg, and Mac results are specific to the recorded Apple Silicon/macOS environment.

Receipts, screenshots, before-review files, Claude outputs and full build/unit/browser logs are retained under each machine's `integration150/evidence/`. Selected non-secret results are copied to the worktree's ignored `.cache/evidence/{linux,mac}/`. Authentication URLs and credentials are omitted from public documentation.

All requested integration and regression checks passed. The user subsequently approved the separate 1.5.1 release action.
