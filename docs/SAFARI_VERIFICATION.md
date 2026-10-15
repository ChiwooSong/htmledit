# Safari selection fix verification — 2026-10-15

Follow-up: integration with v1.5.0 and its new regression checks is now complete in a separate candidate. See [the 1.5.0 integration results](SAFARI_150_INTEGRATION.md). The historical 1.4.1-based results below are retained as recorded.

## Release baseline correction

Live registry and GitHub checks on 2026-10-15 confirm that the current published version and npm `latest` are **1.5.0**, with release commit `1682a9a2894a7d9271d5d4306de4cc6535bc5989` ([release](https://github.com/ChiwooSong/htmledit/releases/tag/v1.5.0)). The tests below ran on an unpublished candidate based on **1.4.1**, not the current 1.5.0 package. Their results remain valid for that candidate only. Before release, these fixes must be integrated with 1.5.0 and revalidated, including its multi-selection, batch deletion and review-v2 joint-note workflows. No such integration or 1.5.0 Safari validation is claimed here.

## Reproduction on published 1.4.1

The user confirmed in ordinary Safari that document text could be drag-selected but clicking it did not open the element editor. Actual Safari 18.6 on macOS 15.6.1 / Apple Silicon reproduced the same failure with WebDriver clicks and pointer actions. The preview retained `sandbox="allow-same-origin"`.

A minimal separate browser diagnostic registered parent-context click listeners in a sandboxed frame and an ordinary control frame. Safari delivered zero sandboxed-frame clicks and one control-frame click. This matches [WebKit issue 218086](https://bugs.webkit.org/show_bug.cgi?id=218086). The result is not inferred from Playwright WebKit.

## Candidate implementation

This unpublished change starts from release commit `92d62cbc19fe9ad598ec7f7aa7ca944b8cfa2410` (`v1.4.1`) in a separate worktree. It does not modify the old development checkout, the published package, or another task's worktree.

- Probe whether parent listeners receive events in the actual preview document.
- When delivery is blocked, receive pointer and keyboard events on a transparent parent-owned surface and resolve their coordinates to document elements and text nodes.
- Keep the existing script-disabled sandbox. No `allow-scripts` permission is added to the editing frame, and no script is injected into user HTML.
- Forward wheel and navigation-key scrolling through nested scroll containers; retain selection, inline editing, note markers and undo/redo. Hide the surface in Interact mode.
- On browsers that deliver parent listeners normally, retain the existing event path.
- Start clipboard writes inside the user's click gesture, providing their text only after the working file saves and the revision/input guards pass. This fixes Safari losing clipboard permission while awaiting the save. Failed saves and conflicts leave the previous clipboard unchanged. See [WebKit's asynchronous clipboard guidance](https://webkit.org/blog/10855/async-clipboard-api/).
- Clamp forwarded scroll values to the actual document/element extent. Actual Safari wrapped an excessively large Home-key scroll assignment instead of reaching the top; the bounded assignment passes.

The candidate keeps package version 1.4.1 for isolated testing only. It is **not** the registry artifact. Final candidate tarball SHA-256: `3d84151980c78dbe0df65e4431857a81940afc5e2fdfcd0ad2370a3e1a77b430`. This includes the selection, clipboard and bounded-scroll fixes; subsequent documentation additions are not in that tarball. Both platforms use isolated `~/htmledit-platform-1.4.0/platform-final/` installations of both skills and their pinned runtime. No tag, push or publication was performed.

## Automated regression checks

- Build and TypeScript checks passed.
- All 82 unit tests passed, including four clipboard sequencing/failure cases.
- All 104 Windows Chrome/Edge browser tests passed after the clipboard change, with two workers on a dedicated test port. After the final scroll clamp, the six affected preview-event cases passed again: selection, nested-text editing, notes, inline double-click, keyboard history, nested scrolling, mode transitions, and script isolation.
- One earlier focused Edge document-switch test selected a new server port instead of the expected reused port. The unchanged case passed three repeats in each browser (6/6), followed by the full 104/104 run. The transient result is retained rather than counted as an initial clean run.
- Final package lifecycle smoke passed (46 packaged files): both skill installations, pinned runtime, open/reuse, checkout/apply/backup, normal and alias reinstall, modified-skill protection, stop and uninstall.
- Changed source and test files passed formatting and `git diff --check`.

The emulated event-delivery cases are browser regressions, not a replacement for the physical Mac result below.

## Physical Mac / actual Safari

Environment: macOS 15.6.1, arm64, Safari 18.6, isolated Node 22.23.3 and authenticated Claude Code 2.1.296. This is actual Safari through SafariDriver, not Playwright WebKit. Existing published-package fixtures and global installations remain intact.

Verified against the installed candidate:

1. Click the document through the parent event surface and edit the first text segment, retaining nested emphasis and Korean/Japanese/Portuguese text.
2. Add three notes through Safari: an English heading change, Japanese SVG insertion request and Portuguese paragraph deletion. Save the notes to the connected review file.
3. Actual Claude independently follows the installed skill's `status → checkout → edit candidate → apply --revision → status` procedure. All three notes are fulfilled and completed, with no permission bypass.
4. The already-open Safari document updates automatically after apply, without navigation or reloading. The heading, SVG and deletion are verified independently, together with all unchanged note metadata, source bytes, document language and styles. The backup is byte-identical to the pre-apply review.
5. A further text edit and native Cmd+Z restore the original text. The editing frame still has only `allow-same-origin`.
6. Save-and-copy succeeds: native macOS clipboard readback contains the exact saved review path. Failed-save (503) and conflict (409) responses injected at the browser request boundary preserve both the previous clipboard sentinel and the working-file bytes. Normal copy succeeds after recovery. These are controlled failure tests, not claims of a real disk failure.
7. Final HTML downloads through Safari's actual download permission prompt. The file recovered from Downloads contains the applied changes and no review metadata or editor identifiers.
8. Nested keyboard scrolling, PageDown/Home, note-marker movement/visibility and mobile-width marker positioning pass. A separate native wheel diagnostic records a trusted wheel event with deltaY 120 and nested scrollTop 120. The initial wheel action in the combined harness timed out; repositioning the pointer and measuring the actual delivered event independently resolved the automation ambiguity.
9. All five UI languages switch while preserving a pending multilingual note, original document `lang="fr"`, saved bytes and script isolation.
10. Image insertion, replacement, undo/redo, save/reopen and a clean final download pass. The image is selected through WebDriver's file-input protocol, not a manually operated native picker. The test uses the editor's percentage sizing so a one-pixel fixture can be clicked visibly.

The final candidate repeated the full three-note native Claude workflow in Safari, independently checked its result and downloaded `platform-final.edited.html`. Claude reported no permission denials in this final Safari run. This is separate from the initial selection-only candidate (`b2aff40b05d27d3b1594fb499cbb7a7b64367e8ffb8499f1db966bef1d2010eb`), on which the user manually confirmed ordinary Safari single-click selection and double-click editing.

## Ubuntu WSLg and Mac Chrome rechecks

| Environment                    | Actual browser             | Final candidate result |
| ------------------------------ | -------------------------- | ---------------------- |
| Ubuntu 24.04.3, WSL2/WSLg, x64 | Linux Chrome 155.0.8059.79 | Passed                 |
| macOS 15.6.1, Apple Silicon    | Chrome 155.0.8059.40       | Passed                 |

Both use isolated Node 22.23.3 and authenticated native Claude Code 2.1.296. In each browser, the checks cover direct nested-text editing, three multilingual notes, save/copy, actual Claude checkout/apply, automatic refresh, original preservation, unchanged note metadata except completion, byte-identical pre-apply backup, clean export, saved-result reload, five language switches, image insertion/replacement and undo/redo. Claude's attempted auxiliary shell-edit commands were denied by the narrow allowlist; it completed through the allowed file editing and HTMLEdit runner. Permissions were not broadened.

Final working-file SHA-256 values after independently verified AI application:

- Ubuntu Chrome: `9319c77595ceeca5d04def05f4984e7eb5767cb620f3cd1190b6ddb91df1a894`.
- Mac Chrome: `8c19b0b007c996b356d7c201221aa65c30e8591a7c1c6bbfb0e02c0c8e465e3c`.

The WSL result uses the Linux runtime and WSLg Chrome. It is not a general Linux desktop certification or a Windows-browser proxy test. Noto CJK fonts were added to the isolated test environment's OS earlier to resolve missing Korean/Japanese glyphs; that is an environment prerequisite, not an HTML translation.

## Evidence, manual confirmations and scope limits

Remote evidence under `platform-final/evidence/` includes the before-review files, Claude results, browser screenshots, `safari.json`, `safari-followup.json`, `safari-wheel.json`, `safari-images.json`, `live-stage.json`, `independent-verification.json`, `display.json` and `images.json`. Selected non-secret receipts and screenshots are copied into this worktree's ignored `.cache/verification-final/{linux,mac}/`. Connection URLs and authentication data are excluded from public documentation.

- The user confirmed single-click selection and double-click editing in ordinary Safari. SafariDriver's paired clicks did not reliably produce a double-click, so manual confirmation is recorded separately.
- The user confirmed real Korean IME composition and applying the text in the final candidate's ordinary Safari window (2026-10-15). This is separate from automated Unicode entry.
- The first WSL physical IME attempt failed: the user could not switch to Korean. Inspection found no IBus/Fcitx executable, installed Hangul engine or input-method environment variables. This was an incomplete OS input environment; the retest below passed after configuring an input method.
- Installed Ubuntu packages `ibus`, `ibus-hangul` and `ibus-gtk3` (`dbus-x11` was already present). IBus is 1.5.29 and the Hangul engine is 1.5.5. A dedicated `dbus-run-session`, task-local `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`, keyfile settings backend and `ime-chrome-profile` keep the test configuration separate from the user's normal browser and shell configuration. The session uses `GTK_IM_MODULE=ibus`, `XMODIFIERS=@im=ibus`, Chrome X11, initial Hangul mode and `Hangul,Shift+space` switching. `ibus engine` reports `hangul`. The user confirmed real Korean input and applying the text in this WSLg Chrome window on 2026-10-15. This closes the remaining physical IME check; no HTMLEdit code change was needed for this environment issue. Setup follows the [IBus test guidance](https://github.com/ibus/ibus/wiki/ReadMe) and the installed Hangul GSettings schema. The input method packages are OS prerequisites, not bundled HTMLEdit runtime dependencies.
- Native Linux and Mac HTML picker cancel/select were confirmed earlier by the user on published 1.4.1. Ubuntu assertions passed. On Mac, the automation lost the response body during navigation; user confirmation and the new review file are the evidence. These native picker interactions were not repeated in this candidate run; no picker implementation changed here.
- Actual Safari Cmd+Z passed on the initial selection candidate. Broader native keyboard/assistive-technology coverage, other Linux distributions, Intel Macs and other macOS versions are not claimed.

The owned SafariDriver session was ended, and the final AI-reviewed document was opened in ordinary Safari for manual use. The selection failure was reproduced on the historical published 1.4.1 package. These candidate fixes have not been integrated with or released on top of the current 1.5.0 baseline.
