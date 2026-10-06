import { atom, read, update } from 'claude-code'
import type { Engine, Register } from 'claude-code'

import type { Undone } from '../types'

const PANE = 'left-undone'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
const items = atom({ plugin: 'left-undone', key: 'items' } as const, [])

// Promises outlive the session: every change is mirrored into $.store, and
// session.start reads it back. Todos are Claude's own list and stay per-session.
const change = async ($: Engine, fn: (old: Undone[]) => Undone[]) => {
  await update($, items, fn)
  const open = (await read($, items)).filter(i => i.kind === 'open')
  await $.store.set('open', open)
}

const MAX_OPEN = 300
const RULES = `You audit an AI assistant's promises. You are given PROMISES it made earlier that are still open, and its latest REPLY, both inside tags. Answer with a single JSON object and nothing else: {"done": [numbers], "add": ["..."]}
- "done": numbers of open promises that the reply shows were now carried out, or are clearly dropped or no longer applicable.
- "add": new promises the ASSISTANT made in the reply and has NOT carried out by the end of it: "I'll do X", "next I will Y", "I can add Z if you want" (an offer), "still to do on my side". At most 5, each under 140 characters, phrased as the assistant's own task.
Never add things the USER has to do or decide, questions for the user, descriptions of work already done, or explanations. If there is nothing, answer {"done": [], "add": []}. Never ask for input and never explain: the data is already provided.`

const ask = (current: string[], reply: string) => `<open_promises>
${current.length ? current.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(none)'}
</open_promises>

<reply>
${reply}
</reply>

Output the JSON object now.`

export const parseAudit = (reply: string): { done: number[]; add: string[] } => {
  const from = reply.indexOf('{')
  const to = reply.lastIndexOf('}')
  if (from < 0 || to < from) return { done: [], add: [] }
  try {
    const r: { done?: unknown; add?: unknown } = JSON.parse(reply.slice(from, to + 1))
    const done = Array.isArray(r.done) ? r.done.filter((x): x is number => Number.isInteger(x)) : []
    const add = Array.isArray(r.add)
      ? r.add.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim().slice(0, 240)).slice(0, 5)
      : []
    return { done, add }
  } catch {
    return { done: [], add: [] }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'left-undone',
      description: 'Show the list of todos Claude left undone',
    })
    const saved = await $.store.get('open')
    if (Array.isArray(saved) && saved.length > 0) {
      await update($, items, old => [...old.filter(i => i.kind === 'todo'), ...(saved as Undone[])])
    }
    void $.ui.open({ id: PANE, title: 'Left undone' })

    return next(e)
  })

  on('command.run', { command: 'left-undone' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Left undone' })

    return { text: 'Left undone pane opened.' }
  })

  // Every TodoWrite replaces the todo entries; whatever is not completed is
  // "undone". Flags survive a rewrite when the todo's text is unchanged.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    await change($, old => [
      ...e.todos
        .filter(t => t.status !== 'completed')
        .map(t => ({
          text: t.content,
          kind: 'todo' as const,
          isFlagged: old.some(o => o.kind === 'todo' && o.text === t.content && o.isFlagged),
        })),
      ...old.filter(o => o.kind === 'open'),
    ])

    return ran
  })

  // After each turn a small model reads the answer against the promises still
  // open: it closes the ones the answer kept and adds the new ones it made.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && e.reason === 'answer' && done.text.trim().length > 40) {
      const open = (await read($, items)).filter(i => i.kind === 'open')
      const r = await $.model.complete({
        model: 'haiku',
        system: RULES,
        prompt: ask(open.map(i => i.text), done.text.slice(0, 6000)),
        effort: 'low',
        maxTokens: 500,
        timeoutMs: 10000,
      })
      const audit = r.isAnswered ? parseAudit(r.text) : { done: [], add: [] }
      if (!r.isAnswered) $.ui.toast(`left-undone: model call failed (${r.reason})`)
      const closed = new Set(audit.done.map(n => open[n - 1]?.text))
      if (closed.size > 0 || audit.add.length > 0) {
        await change($, old => [
          ...old.filter(o => !(o.kind === 'open' && closed.has(o.text))),
          ...audit.add
            .filter(text => !old.some(o => o.text === text))
            .map(text => ({ text, kind: 'open' as const, isFlagged: false })),
        ].slice(-MAX_OPEN))
      }
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all: Undone[] = await read($, items)
    const todos = all.filter(i => i.kind === 'todo').slice(0, LETTERS.length)
    // Flagged lines stay pinned; the rest of the letters go to the newest lines.
    const room = LETTERS.length - todos.length
    const saidAll = all.filter(i => i.kind === 'open')
    const pinned = saidAll.filter(i => i.isFlagged).slice(-room)
    const recent = saidAll.filter(i => !i.isFlagged).slice(-(room - pinned.length))
    const said = saidAll.filter(i => pinned.includes(i) || recent.includes(i))
    const list = [...todos, ...said]
    const flagged = list.filter(i => i.isFlagged)

    const toggle = (target: Undone) =>
      change($, cur =>
        cur.map(one =>
          one.kind === target.kind && one.text === target.text
            ? { ...one, isFlagged: !one.isFlagged }
            : one,
        ),
      )

    const send = async () => {
      if (flagged.length === 0) return
      const text = flagged.map(i => `You left this undone: ${i.text}`).join('\n')
      await change($, all => all.map(one => ({ ...one, isFlagged: false })))
      await $.prompt.submit({ text, asUser: true })
    }

    const markDone = async () => {
      if (flagged.length === 0) return
      await change($, cur =>
        cur.filter(one => !flagged.some(f => f.kind === one.kind && f.text === one.text)),
      )
    }

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>Nothing yet: todos and Claude's replies show here.</Text>}
        {list.map((item, i) => (
          <Button
            key={`item-${i}`}
            plain
            hotkey={LETTERS[i]}
            label={`${item.isFlagged ? '[x]' : '[ ]'} ${item.kind === 'todo' ? '(todo) ' : ''}${item.text}`}
            onPress={() => void toggle(item)}
          />
        ))}
        {flagged.length > 0 && (
          <Button
            key="done"
            hotkey="2"
            label={`Mark ${flagged.length} flagged as done`}
            onPress={() => void markDone()}
          />
        )}
        {flagged.length > 0 && (
          <Button
            key="send"
            variant="primary"
            hotkey="1"
            label={`Send ${flagged.length} flagged to Claude`}
            onPress={() => void send()}
          />
        )}
        <Text dimColor>letter = flag, 1 = send to Claude, 2 = mark done</Text>
      </Box>
    )
  })
}
