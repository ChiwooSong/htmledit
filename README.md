# HTMLEdit

[English](README.md) · [한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [日本語](docs/i18n/README.ja.md) · [Português (Brasil)](docs/i18n/README.pt-BR.md)

Edit AI-generated HTML visually, leave notes on specific elements, and ask Claude Code or Codex to apply them. HTMLEdit runs locally, without an account or AI API key. Windows Chrome and Edge are the supported desktop environment.

## Install and open

Requires Node.js **22.12+** and Claude Code or Codex running on your computer. Run outside a checkout of the HTMLEdit source repository:

```sh
npx --yes @woody_s/htmledit@latest install --agent all
npx --yes @woody_s/htmledit@latest open "./document.html"
```

Use `--agent claude` or `--agent codex` to install one skill. In your AI conversation, invoke `/htmledit` in Claude Code or `$htmledit` in Codex, or ask to open your HTML with HTMLEdit. Start a new AI session if the skill is not listed. The adjacent `document.review.html` is the working file; your original is preserved. If it already exists, open that review file rather than overwriting it.

## Language

The **Language** menu supports Korean, English, Spanish, Japanese and Brazilian Portuguese. Automatic uses your browser's preferred supported language; unsupported languages fall back to English. Regional variants are matched, for example `es-MX → es` and `pt-PT → pt-BR`.

Manual choices persist across documents and ports in connected mode. Download mode stores the choice for the current browser origin. Return to **Automatic** to follow your browser again. Changing language preserves selections, unsaved text and notes, history and the opened document. Your document, its `lang` attribute, filenames and note content are never translated. Example documents use the language selected when you open them.

CLI help and messages use `--lang`, then the saved manual choice, then the operating-system locale, then English. `open --lang` sets the initial browser language for that opening without changing your saved preference:

```sh
npx --yes @woody_s/htmledit@latest open "./document.html" --lang ja
npx --yes @woody_s/htmledit@latest --help --lang es
```

Supported `--lang` values: `ko`, `en`, `es`, `ja`, `pt-BR` (recognized regional variants also work). Commands, JSON keys, IDs and error codes stay unchanged across languages. Language settings live in `~/.htmledit/preferences.json`, or under `HTMLEDIT_HOME` if configured. A settings-write failure does not discard edits; the current choice may not persist.

## Edit and leave notes

1. Click an element to change its text, color or font size. Double-click text for inline editing; Ctrl+Enter applies and Esc cancels. IME composition is preserved. Nested emphasis and links remain intact.
2. Use **Select parent element** for a card or larger region. Delete an element or replace an existing image with PNG, JPEG, WebP or GIF. Replacement images are embedded in the HTML, including responsive-image replacements.
3. Choose **Add notes**, select an element, choose **This element / Before / After / Inside**, and describe your request. Use notes for new elements and layout changes. Numbered markers connect to the note list.
4. Apply text inputs and add or save the note, then click **Save and copy AI request**. Connected mode saves the working file before copying its path and request. **Save working file** only saves. In download mode, attach the downloaded review HTML along with the copied request.
5. Paste the request into your AI conversation. The skill runs `status → checkout → edit candidate → apply → status`. Apply checks the revision, backs up the prior file and updates the connected review. The editor refreshes automatically when there are no unsaved changes.
6. Inspect the result and completed notes. **Save final HTML** downloads `document.edited.html` without notes or editor IDs. It cannot restore earlier notes when reopened.

Notes can be edited, deleted, completed, reopened or reassigned. Missing or duplicate targets are not guessed. A fulfilled deletion may leave a completed note with **Target missing**. HTMLEdit does not decide automatically whether a request was fulfilled.

**Save and copy AI request** stops on unapplied input, save errors, conflicts or changes made while saving. If saving succeeds but clipboard access fails, the help dialog provides the request for manual copying.

## Documents, interaction and recovery

**Open another document** asks how to handle unsaved work, then opens the Windows file picker. Cancellation or a save failure keeps the current document. Existing review files reopen without being overwritten. Previous document servers and backups remain available. The native picker's standard buttons use the Windows display language.

**Interact** enables menus and tabs in trusted documents. Navigate, then choose **Edit directly** or **Add notes** to keep that screen while editing. **Back to first screen** resets navigation without discarding edits or notes. Classes, styles and visibility of original elements are supported; script-created elements, form values and canvas editing are not. Navigation and scroll state are session-only, while original scripts remain in exports.

Review HTML keeps invisible IDs, notes and an English AI handoff comment. Ordinary browsers show only the document. Malformed or unsupported note metadata blocks saving. Keep the original before explicitly choosing **Exclude unreadable notes**. Browser source-view HTML is restored to the original document; ordinary code samples are left alone.

Connected drafts, candidates and byte-preserving backups live beside the document in `.htmledit/`. File writes use revision checks. If AI or another program changes the file while you have unsaved edits, **Save my edits separately** before **Reopen disk version**. External programs do not participate in HTMLEdit's write lock. AI must use `apply`, not overwrite the review directly.

Download mode retains one recent draft in IndexedDB for the current origin. Drafts save after roughly 0.6 seconds; save an HTML file for durable storage. Undo/redo retains 50 changes in the current session. Restoring a draft or reloading AI results does not restore old undo history; previous file versions remain in backups.

## Update, stop and uninstall

Repeat the installation command to update. Installed runtimes are pinned under `~/.htmledit/versions/<version>` and survive npm cache cleanup. Start a new editor session after updating. Modified skills are protected: back up the exact folder named in the error before reinstalling.

Use the installed runner at `~/.agents/skills/htmledit/scripts/run.mjs` for Codex or `~/.claude/skills/htmledit/scripts/run.mjs` for Claude Code:

```sh
node "<skill-directory>/scripts/run.mjs" status --file "./document.review.html" --json
node "<skill-directory>/scripts/run.mjs" stop --file "./document.review.html"
node "<skill-directory>/scripts/run.mjs" uninstall --agent all
```

Stop active servers first. Uninstall removes managed skills; it preserves documents, backups, settings, runtimes and running servers. A separate cloud AI environment cannot directly access files on your PC. macOS/Linux file pickers and end-to-end browser use are not officially supported in this release.

## Supported files and local processing

Use a single UTF-8 static HTML file with embedded CSS and images: HTML up to 25MB, replacement images up to 10MB, up to 5,000 notes of 1–20,000 characters each. Exports may normalize HTML syntax while preserving structure. External CSS, images and fonts retain their URLs; related local folders are not collected. React apps, dynamic charts and runtime Tailwind scripts are outside the supported scope. Desktop, 768px and 390px preview widths help inspect responsive layouts.

Direct-edit and note modes block scripts. Interact runs inline scripts in a separate sandboxed origin; editor storage and connection tokens are not exposed. External scripts, fetch/XHR, forms, popups and top navigation are blocked. Document scripts can still read preview contents and may send information via image/style requests or navigation of their own frame. Use Interact only for trusted documents. Return to the first screen if document navigation disconnects interaction.

The connected server listens on `127.0.0.1` and accesses the selected working file. Do not share its URL: it contains an editing token. HTMLEdit makes no AI calls and collects no usage telemetry. When you ask an AI service to process a document, that service's fees and data policies apply.

## Develop and verify

```sh
npm ci
npm run build
npm start
# development: npm run dev
npm test
npm run test:e2e
npm run test:package
```

The standalone editor uses `http://127.0.0.1:5173`; `start.cmd` also installs, builds and opens it on Windows. Close its terminal or press Ctrl+C to stop it. This mode downloads files rather than connecting to a working path. Chrome and Edge must be installed for browser tests.

Translated examples are under `public/examples/<language>/` in source and `dist/examples/<language>/` in the package. [`docs/i18n/`](docs/i18n/) contains the translated guides, review format and terminology. See [review format v1](docs/REVIEW_FORMAT.md) and [verification history](docs/SKILLS_VERIFICATION.md). MIT licensed.
