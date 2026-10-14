# HTMLEdit

[English](README.md) · [한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [日本語](docs/i18n/README.ja.md) · [Português (Brasil)](docs/i18n/README.pt-BR.md)

**Point to what you want changed. Let your AI handle the HTML.**

Open an AI-generated HTML document, make small edits on screen, and leave a request on the exact element. Save it, send the request to Claude Code or Codex, and review the result in the same editor.

Built for the moment when explaining “the paragraph under the second card” takes longer than clicking it.

**Local editor · Claude Code & Codex skills · Five UI languages · MIT licensed**

## See it in action

Three requests on a real HTML document: rename a heading, add a home icon before it, and remove another card's description.

![HTMLEdit with three element-linked requests beside the selected document](https://raw.githubusercontent.com/ChiwooSong/htmledit/main/docs/media/notes-before.png)

The result after this Codex session read the saved notes and applied them through the installed skill:

![The heading changed, a home icon was added, and the description was removed; all three notes are complete](https://raw.githubusercontent.com/ChiwooSong/htmledit/main/docs/media/notes-after.png)

Captured from the published **1.3.0** package on Windows Chrome. Browser actions were automated; this interactive Codex session interpreted the saved requests and edited the checked-out candidate. [Read the verification and inspect the before/after HTML](docs/AI_WORKFLOW_VERIFICATION.md).

## What you can do

| On the screen                                                             | In your AI conversation                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Edit text, color and font size; insert or replace images; delete elements | Ask for new elements or layout changes using saved notes           |
| Attach a request to an element, or its before/after/inside position       | Give the AI an exact target without describing its screen location |
| Save and copy the AI request                                              | Paste it into Claude Code or Codex to apply the notes              |
| Review the updated document and completed notes                           | Keep a backup of the previous file and export clean HTML           |

## Install and open

Requires **Node.js 22.12+** and a local Claude Code or Codex session. Version **1.4.0** adds image insertion. **Windows Chrome and Edge** remain the primary supported desktop environment. Your AI tool uses its own account; HTMLEdit needs no separate account or API key.

Run these commands in your document folder, outside the HTMLEdit source checkout:

```sh
npx --yes @woody_s/htmledit@latest install --agent all
npx --yes @woody_s/htmledit@latest open "./document.html"
```

Use `--agent claude` or `--agent codex` to install one skill. In a new AI session, use `/htmledit` in Claude Code or `$htmledit` in Codex. You can also ask: “Open this HTML with HTMLEdit.”

## Your next edit

1. **Open your HTML.** HTMLEdit creates `document.review.html` beside the original. Existing review files can be reopened.
2. **Edit or leave a note.** Change small details directly. Select an element and write a request for anything more involved.
3. **Save and copy AI request.** Paste the copied request into your AI conversation.
4. **Review the result.** The AI applies the saved notes through the skill. The editor refreshes automatically when there are no unsaved changes.
5. **Save final HTML.** Export the edited document without notes or editor identifiers.

The editor runs locally. HTMLEdit does not call an AI API or collect usage telemetry. When you ask your AI to process a file, that AI service's fees and data policies apply.

## Start with a single HTML file

Best suited to static documents, landing pages and reports with embedded styles and images. The UI supports English, Korean, Spanish, Japanese and Brazilian Portuguese.

External resources must remain accessible. Related local asset folders are not collected. React apps, runtime Tailwind and dynamic charts are outside the supported scope. Trusted inline menus and tabs can be navigated in **Interact** mode before editing.

The demonstrated Codex workflow passed note application, automatic refresh, backup, reload and clean export. Claude Code Remote Control also passed a separate five-language workflow with manual approvals on the 1.3.0 candidate; [see the recorded evidence](docs/SKILLS_VERIFICATION.md#separate-claude-use-successful-manual-approval-follow-up). These checks do not establish unattended CLI operation. Version 1.4.0 also includes experimental Linux/macOS launchers and file pickers. Automated Chrome checks passed on Ubuntu 24.04 WSL2 and macOS 15.6.1 Apple Silicon; native picker interaction and Safari remain unverified. See the verification record before relying on those environments.

## Insert images

Select a document element, then click **Insert image**. Choose **Before**, **After**, or **At the end inside**; the position marker and document preview show the result before it is applied. For table rows or list containers, select a cell, list item, or a suitable parent instead.

Choose one local PNG, JPEG, WebP or GIF, drop it onto the image panel, paste an image in the panel with Ctrl+V / Cmd+V, or load a direct HTTP/HTTPS image URL. Each image is limited to 10MB and must decode successfully. URL downloads omit credentials, have a 15-second timeout, and follow browser cross-origin rules. If the site blocks access, use a downloaded file or paste the image. SVG, HTML clipboard fragments and multiple images at once are not supported.

Use original size (constrained to the available width) or 1–100% of the container width, choose left/center/right alignment and enter alternative text. **Apply image** embeds the bytes in the HTML and creates one undo step. Until then, previews do not change saved HTML or history. All embedded images together must fit within the 25MB HTML limit. No compression or format conversion is performed.

The inserted image stays selected. Use **Image size and alignment** for later adjustments, or add a note for AI layout changes. **Replace image** uses the same file, URL and paste inputs while preserving existing layout styles. Finish or cancel the image panel before copying the AI request. Save and copy, then use the usual checkout/apply workflow; review format v1 is unchanged.

## Learn more and give feedback

- [Full usage guide](docs/USAGE.md): text editing, document interaction, languages, recovery, updates and removal.
- [AI workflow verification](docs/AI_WORKFLOW_VERIFICATION.md): screenshots, requests, output files and the limits of this check.
- [Development and verification history](docs/SKILLS_VERIFICATION.md) · [Review file format](docs/REVIEW_FORMAT.md).
- [npm package](https://www.npmjs.com/package/@woody_s/htmledit) · [GitHub releases](https://github.com/ChiwooSong/htmledit/releases).
- [Report an issue](https://github.com/ChiwooSong/htmledit/issues): include your OS, browser, package version and a minimal HTML example with private content removed.

To develop locally: `npm ci`, `npm run build`, then `npm start`. See the full guide for tests and development mode.

[MIT License](LICENSE).
