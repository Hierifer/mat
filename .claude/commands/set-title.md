Set the Materm terminal window title.

Run the following command to set the window/tab title in Materm terminal:

```bash
echo -ne "\033]0;$ARGUMENTS\007"
```

This sends an OSC 0 escape sequence that Materm interprets to update both the tab title and the OS window title (dock/taskbar).

If running inside a subprocess (e.g., within Claude Code or Codex), use:

```bash
echo -ne "\033]0;$ARGUMENTS\007" > /dev/tty
```

Do not output anything else. Just run the command silently.
