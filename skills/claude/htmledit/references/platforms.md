# Desktop and remote sessions

HTMLEdit primarily supports Windows Chrome/Edge. Linux/macOS launchers and pickers are experimental. Automated Chrome tests passed on Ubuntu 24.04 WSL2 and macOS 15.6.1 Apple Silicon; The 1.5.1 candidate also passed actual Safari 18.6 editing and native Claude joint-note application. Manual Korean IME and historical native picker results are recorded separately in docs/SAFARI_150_INTEGRATION.md. Consult the packaged verification record for actual completed checks. Do not generalize WSL results to every Linux desktop, or Apple Silicon results to Intel Macs.

Ubuntu file selection requires zenity and a graphical desktop. Browser opening requires xdg-utils and an installed browser. WSLg must use Linux Node and Linux Chrome; Windows browser access is a separate interoperability path. macOS uses its built-in file picker and Cmd editing shortcuts.

For SSH or a headless session, use `open "<file>" --no-browser --json`. The returned loopback URL belongs to the remote machine. To view it locally, forward only its port with an SSH loopback tunnel; never change HTMLEdit to listen publicly. The token is a credential. Do not put it in shared logs or documentation.

Native dialogs appear on the server's desktop, not the SSH client's computer. Without an active desktop or the picker dependency, open the user's chosen file with the CLI instead. Cancellation preserves the current document. A browser-launch warning does not mean the server failed: check status and offer the URL when the user needs it. Do not claim a browser opened solely because a launch command exited successfully.

Keep the same status → checkout → edit returned candidate → apply → status workflow on every OS. Use paths on the machine running the installed skill. Do not copy a Windows absolute path into a Linux or macOS invocation.

WSLg Korean input requires a Linux input method, such as IBus with ibus-hangul and the appropriate GTK integration, in addition to CJK fonts. Windows input switching alone is not evidence of a configured Linux IME. Keep task-specific input settings separate from the user’s normal desktop configuration.
