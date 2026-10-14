# Live AI note application — 2026-10-14

**Passed for this interactive Codex session using the published `@woody_s/htmledit@1.3.0` package on Windows Chrome 154.0.8037.95, Node.js 22.17.0.**

The package was downloaded from npm and installed into an isolated test home. The source checkout's unpublished 1.4.0 changes and the user's existing documents, runtimes and browser tabs were not used. This is a real model-directed application of saved notes, not a claim that every request or every agent environment has been validated.

## What happened

1. Opened the package's English Onyu Studio example using the installed Codex skill runner. HTMLEdit created an adjacent review copy and a loopback server.
2. Used Playwright with Chrome to operate the actual editor: changed `OUR SERVICES` to `WHAT WE DO`, selected elements and authored the three notes below.
3. Clicked **Save and copy AI request**. Verified that the copied text named the working file and requested the skill's checkout/apply workflow.
4. This interactive Codex session read the installed SKILL.md and review-format reference, ran `status` and `checkout`, read the returned candidate and interpreted the saved notes by their target IDs. It wrote changes only to that candidate, then used `apply` with the checkout revision and checked `status` again. No second AI process or canned demo-result generator was used.
5. The already-open browser refreshed without a manual reload. Assertions checked the rendered changes and three completed notes. Exported final HTML and reloaded the editor to verify persistence. Inspected both captured screenshots visually.
6. Verified exact backup bytes, original preservation and metadata invariants, then stopped the isolated test server.

## Requests and results

| Target / relation                    | Saved request                                                                                   | Observed result                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| First card heading / This element    | Change this heading to "Homes made for living".                                                 | Heading text changed; its target ID survived.                                        |
| Same heading / Before                | Add a small outlined home icon before this heading. Use inline SVG in the existing green color. | A 20×20 inline SVG immediately precedes the heading and inherits the document color. |
| Second card paragraph / This element | Remove this description paragraph. Keep the card number and heading.                            | Paragraph removed; card number and heading retained.                                 |

All three notes became `done:true`. IDs, request text, relations, target IDs and summaries were unchanged. The completed deletion correctly reports a missing target; it is not reassigned to a different element. The earlier direct edit, `WHAT WE DO`, survived AI application. The original stylesheet was unchanged.

## Inspect the evidence

- [Before: saved review HTML](examples/ai-workflow-20261014/before.review.html)
- [After: AI-applied review HTML](examples/ai-workflow-20261014/after.review.html)
- [Final: clean exported HTML](examples/ai-workflow-20261014/final.html)
- [File checks and SHA-256 hashes](examples/ai-workflow-20261014/verification.json)
- [Before screenshot](media/notes-before.png) · [After screenshot](media/notes-after.png)

The backup matched the before-review file byte for byte. The original example was unchanged. Only the deleted paragraph and its descendant lost existing element IDs. Final HTML retained the requested changes and contained neither review metadata nor editor IDs. Reopening the review restored all three completed notes.

Screenshots show the actual editor workspace, cropped to exclude machine-specific connection information. They are from the same connected browser before and after application, with no mock UI or substituted document content. Connection tokens, machine paths and private session logs are not part of these public artifacts.

## Scope and remaining checks

- Confirmed: npm installation → browser edit/notes → save/copy → this Codex session's skill-based application → live refresh → backup → export → reload.
- The model interpreted notes in the current interactive Codex conversation. This does not establish a pass for a separately launched unattended Codex CLI or a fresh user's automatic skill discovery.
- Claude Code was not invoked again during this run. A separate recorded 1.3.0 candidate test passed through authenticated Remote Control with manual approvals; [its workflow and limitations](SKILLS_VERIFICATION.md#separate-claude-use-successful-manual-approval-follow-up) remain distinct from today's published-package Codex check. Today, the saved Claude output was independently rechecked: five completed notes, exact requested multilingual headings, preserved metadata/styles/direct edit, original hash, exact backup and clean export all passed. The result hash remained `4d565fa6ba0e87c0220709c8d074ec534c299b25fbaeb2bd646ed15cc8ec7bb0`. This file recheck is not a fresh Claude inference or a resolution of the earlier unattended CLI authentication issue.
- This check used Windows Chrome. It does not complete macOS/Linux native AI, native file-dialog or Safari verification for the separate 1.4.0 candidate.
- Browser preparation and assertions were automated; OS-native input and picker interaction were not exercised here. This finite example does not measure general AI accuracy.
