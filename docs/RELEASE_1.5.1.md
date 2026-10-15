# HTMLEdit 1.5.1 — Safari editing and reliable save/copy

Safari can now select document elements and open the inline text editor while keeping document scripts disabled. The fixes preserve 1.5.0 multi-selection, immediate batch deletion and joint notes.

- Use a parent-owned event surface when Safari blocks listeners in the sandboxed preview; keep Ctrl/Cmd selection, Delete and one-step undo/redo working without duplicate keyboard handling.
- Start clipboard permission handling during the click gesture and provide the AI request only after saving succeeds. Failed saves and conflicts preserve the previous clipboard.
- Correct Home/End scrolling in Safari and retain nested scrolling, note-marker positioning and responsive-width previews.
- Preserve review v1/v2, target IDs and joint-note metadata. No review-format migration is required.

## Verification

The integrated candidate passed 86 unit tests on Windows, Ubuntu WSL2 and macOS; 132 Windows Chrome/Edge browser cases; and 66 Chrome cases on each of Ubuntu and macOS. Package lifecycle checks and formatting passed.

On the physical Mac, actual Safari 18.6 passed multi-selection, batch delete/undo/redo, joint-note save/reopen, clipboard and download, image editing, scrolling and controlled save-failure/conflict checks. Actual Claude followed the installed skill's checkout/apply procedure in WSLg Chrome, Mac Chrome and Safari, preserving both joint targets and verifying backups and automatic refresh. See [the integration record](SAFARI_150_INTEGRATION.md) for hashes, environment versions and evidence limits.

Earlier manual tests separately confirmed Safari click/double-click and Korean IME input/apply in Safari and WSLg. WSL required IBus Hangul configuration. Native picker checks were historical and were not repeated for this patch; picker code is unchanged. Windows Chrome/Edge remain primary, with other platform claims limited to the recorded environments.

## Update

Run outside the HTMLEdit source checkout:

```sh
npx --yes @woody_s/htmledit@1.5.1 install --agent all
```

Save work and stop/reopen old editor sessions to load the new runtime. Existing skills and already-running servers are not automatically replaced. Documents and backups are preserved. Use `--agent claude` or `--agent codex` to update one skill.

Publication follows main CI, then tag `v1.5.1`, then GitHub Actions OIDC trusted publishing. No local `npm publish` is used.
