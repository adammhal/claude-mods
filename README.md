# claude-mods

Claude Code mods.

## left-undone

A sidebar that tracks what Claude said it would do and has not done yet. After each turn a small model audits Claude's reply: it adds new promises and closes the ones that were kept. Unfinished TodoWrite items show too.

Keys in the pane: a letter flags an entry, `1` sends the flagged ones back to Claude as "You left this undone: ...", `2` marks them done.

Install, typed at a Claude Code prompt:

```
/plugin install left-undone --marketplace <owner>/<repo>
```

Answer `y` to add the marketplace, then pick the user scope to have it in every session.
