# HTMLEdit 1.4.0 — Image insertion

Select where an image belongs, bring it in from a local file, a direct image URL or the clipboard, and preview it before applying. Images are embedded in the HTML so the same file can be handed to Claude Code or Codex for further layout changes.

- Insert before, after or at the end inside a selected element. Invalid insertion positions are disabled.
- Set proportional width, left/center/right alignment and alternative text. Cancel the preview or apply it as one undo step.
- Replace existing images using the same file, URL and paste inputs while preserving their layout styles.
- PNG, JPEG, WebP and GIF are supported, up to 10MB per image and 25MB for the entire saved HTML. URL downloads follow browser access restrictions; use a file or paste if a site blocks retrieval.
- Korean, English, Spanish, Japanese and Brazilian Portuguese interfaces and guides are included. Review format v1 and the existing checkout/apply workflow are unchanged.

## Update

```sh
npx --yes @woody_s/htmledit@1.4.0 install --agent all
```

Run outside the source checkout. Use `--agent claude` or `--agent codex` for one skill. Reopen the editor and start a new AI session after updating; existing editor sessions keep their previous runtime. Save your current work before switching sessions. Originals, working files and backups are preserved.

## Validation and platform scope

Local validation passed 78 unit tests on Windows, Ubuntu WSL2 and a physical Apple Silicon Mac; 96 browser tests on Windows Chrome/Edge and 48 each on Linux and Mac Chrome; and package installation/lifecycle checks on all three platforms. An actual Codex checkout/apply test verified image-note interpretation, automatic browser refresh, preserved image bytes, a matching backup and clean export. See [verification details](SKILLS_VERIFICATION.md#image-insertion-candidate--2026-10-14).

Windows Chrome/Edge remain the primary supported environment. This release also includes experimental Linux/macOS browser launchers and native document pickers, plus a macOS runtime reinstall fix for aliased paths. Automated coverage used Ubuntu 24.04 WSL2 and macOS 15.6.1 Apple Silicon Chrome. Safari and manual native-picker operation remain unverified; these results do not certify other Linux desktops, Intel Macs, or unattended native AI sessions. Translations have not had native-speaker review.

Publication uses the existing GitHub tag-triggered OIDC trusted-publishing workflow. The GitHub release tarball is downloaded from npm and accompanied by SHA256SUMS.
