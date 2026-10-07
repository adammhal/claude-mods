# claude-mods

Claude Code mods.

## left-undone

A sidebar that tracks what Claude said it would do and has not done yet. After each turn a small model audits Claude's reply: it adds new promises and closes the ones that were kept. Unfinished TodoWrite items show too.

Keys in the pane: a letter flags an entry, `1` sends the flagged ones back to Claude as "You left this undone: ...", `2` marks them done, `3` exports the list to `~/.claude/left-undone/latest.md`, `4` imports it. `/left-undone-export` and `/left-undone-import [path]` do the same. The list is per session.

Install, typed at a Claude Code prompt:

```
/plugin install left-undone --marketplace <owner>/<repo>
```

Answer `y` to add the marketplace, then pick the user scope to have it in every session.

## approve-blocked (experimental, untested)

When auto mode's classifier blocks a tool call, this retries the identical call up to three times so Claude Code's own permission prompt appears after three blocks in a row. It retries calls the classifier denied, so read its source before installing. Whether the retries count toward Claude Code's threshold is not confirmed.

```
/plugin install approve-blocked --marketplace <owner>/<repo>
```
