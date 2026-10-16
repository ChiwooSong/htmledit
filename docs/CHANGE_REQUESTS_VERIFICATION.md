# Change-request import verification

Validated on Windows with Node.js 22 and installed Chrome/Edge on 2026-10-15–16 (KST), in an isolated worktree based on remote `main` at `c4fef7f5739bfa834bd072be0226d2118d93afa3`. This is an unpublished development candidate; the package version remains 1.5.1. Existing work in the primary checkout was preserved.

## Actual AI interpretation and application

The fixture contains nine free-form paragraphs: a heading rename repeated later, a star icon before a button, a second-card description deletion, a joint heading-size request, contradictory background colors, an unclear “that thing” request, and coffee chatter. It also contains an unrelated existing pending footer note.

| Check                                                     | Interactive Codex session | Claude Code signed-in session |
| --------------------------------------------------------- | ------------------------- | ----------------------------- |
| Raw source → submitted proposals                          | 6                         | 6                             |
| Repeated heading request merged with both quotes          | Passed                    | Passed                        |
| Joint request targets both card headings                  | Passed                    | Passed                        |
| Color conflict retained for review                        | Passed                    | Passed                        |
| Unclear target left unbound                               | Passed                    | Passed                        |
| Chatter omitted                                           | Passed                    | Passed                        |
| Submitted proposals all pending; HTML unchanged           | Passed                    | Passed                        |
| Approve 3, exclude remaining proposals through browser UI | Passed                    | Passed                        |
| Only those 3 notes applied and marked done                | Passed                    | Passed                        |
| Existing footer note/content preserved                    | Passed                    | Passed                        |
| Automatic refresh, reload and clean export                | Passed                    | Passed                        |
| Backup byte-identical to pre-apply HTML                   | Passed                    | Passed                        |

Browser input/review clicks and result assertions were automated by `scripts/verify-request-workflow.ts`. The interactive Codex model in this development conversation read the checkout source and HTML, authored the JSON proposal candidate, and edited the approved HTML candidate. Claude Code independently read the extended skill and reference, executed request checkout/submit, and later executed the normal checkout/apply flow with only the copied approved IDs. The fixture driver did not generate proposals or perform document edits. Its approval clicks simulate a user decision on synthetic documents; they are not evidence of a person reviewing real business content.

Claude used the existing Claude account session. The first authentication probe encountered an invalid inherited API key; excluding that variable in the verification child process enabled the existing session. No credentials or global configuration were changed. Analysis session: `6950067d-c5c9-4a4c-b164-1960c5a8ae65`; application session: `67570119-f3ff-47af-9d87-8b1003065ca0`. Claude reported file/status checks and correctly did not claim a browser check; the independent browser driver performed the visual and refresh checks.

The models differed slightly on whether “make the titles a little larger” needed clarification. Both retained the joint targets; that proposal was excluded from application. This small fixture demonstrates the workflow, not universal analysis accuracy.

## Inspectable artifacts

- [Free-form source](examples/change-requests/requests.txt)
- Codex: [before](examples/change-requests/codex-before.review.html), [after](examples/change-requests/codex-after.review.html), [clean export](examples/change-requests/codex-final.html), [proposals and verification](examples/change-requests/codex-verification.json)
- Claude: [before](examples/change-requests/claude-before.review.html), [after](examples/change-requests/claude-after.review.html), [clean export](examples/change-requests/claude-final.html), [proposals and verification](examples/change-requests/claude-verification.json)

Source and proposal evidence are separate files. Neither exported HTML includes the original request text or excluded proposals. The verification JSON contains the SHA-256 of the byte-identical backup.

## Automated checks

- Vitest: **94 tests passed**, including 8 new request tests covering revision guards, approval boundaries, atomic bulk approval, approval revocation after edits, evidence validation, AI-state rejection, multi-target conversion, stable IDs, retry/undo recovery, source persistence, deletion, authenticated API routes, UTF-8 and bounded DOCX extraction.
- Playwright: **134 tests passed** across Windows Chrome and Edge. The new flow covers source input, simulated AI submission, individual review, unresolved-target blocking, request editing and target reassignment, conversion, undo/redo, scoped handoff, reload and DOCX worker extraction. Existing editing, interaction, image, local-file and five-language tests remain green.
- Production build passed. Dependency audit reported **0 vulnerabilities**. Both extended skill definitions passed `quick_validate.py`.
- Packed npm tarball smoke passed: isolated installation of both skills, request checkout/submit/status through the installed runner, unchanged HTML after submission, bundled reference discovery, existing checkout/apply/backup, reinstall and uninstall. The tarball was not published.

Automated submission fixtures are separate from the actual AI runs above. This feature was not tested on Linux, macOS or Safari in this run, and no npm release or GitHub publication was performed.

## Repeating the live check

Build first, then run `npx tsx scripts/verify-request-workflow.ts prepare codex` (or `claude`) in a fresh verification directory. The driver creates synthetic source and a batch through the browser, prints the file and batch ID, and keeps private connection data under ignored `.cache/request-live/`. Ask the corresponding AI to analyze that batch with the development skill. Once submitted, run `npx tsx scripts/verify-request-workflow.ts review codex`; it reviews the fixture and prints the approved note IDs. Ask the AI to apply those IDs while the driver waits for automatic refresh, checks the result and downloads clean HTML. The second stage has a four-minute wait for AI application. Use `stop --file <fixture>` through the same runtime and isolated `HTMLEDIT_HOME` to close its server afterward. Do not run this fixture driver on user documents.
