# Desktop and remote sessions

The 1.4.0 candidate targets Windows Chrome/Edge, Ubuntu 24.04 with WSL2/WSLg Chrome, and macOS 15.6.1 Apple Silicon with Chrome/Safari. Consult the packaged verification record for actual completed checks. Do not generalize WSL results to every Linux desktop, or Apple Silicon results to Intel Macs.

Ubuntu file selection requires zenity and a graphical desktop. Browser opening requires xdg-utils and an installed browser. WSLg must use Linux Node and Linux Chrome; Windows browser access is a separate interoperability path. macOS uses its built-in file picker and Cmd editing shortcuts.

For SSH or a headless session, use `open "<file>" --no-browser --json`. The returned loopback URL belongs to the remote machine. To view it locally, forward only its port with an SSH loopback tunnel; never change HTMLEdit to listen publicly. The token is a credential. Do not put it in shared logs or documentation.

Native dialogs appear on the server's desktop, not the SSH client's computer. Without an active desktop or the picker dependency, open the user's chosen file with the CLI instead. Cancellation preserves the current document. A browser-launch warning does not mean the server failed: check status and offer the URL when the user needs it. Do not claim a browser opened solely because a launch command exited successfully.

Keep the same status → checkout → edit returned candidate → apply → status workflow on every OS. Use paths on the machine running the installed skill. Do not copy a Windows absolute path into a Linux or macOS invocation.
