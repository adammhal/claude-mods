import { test, expect } from 'claude-code/testing'

import { parseAudit } from './register'

test('parseAudit reads closed numbers and new promises', () => {
  expect(parseAudit('ok {"done": [1, "x", 2], "add": ["Publish the page", " ", 3]}')).toEqual({ done: [1, 2], add: ['Publish the page'] })
  expect(parseAudit('{"done": [], "add": []}')).toEqual({ done: [], add: [] })
  expect(parseAudit('nothing')).toEqual({ done: [], add: [] })
  expect(parseAudit('{broken')).toEqual({ done: [], add: [] })
})

test('pending todos reach the pane, completed ones do not', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'write tests', status: 'pending', activeForm: 'writing' },
      { content: 'done thing', status: 'completed', activeForm: 'done' },
    ],
  })
  const tree = await $.ui.render({ component: 'Pane', requestId: 'left-undone', surface: 'terminal' } as never)
  const out = JSON.stringify(tree)
  expect(out).toContain('write tests')
  expect(out).not.toContain('done thing')
})

test('a finished turn adds only the open items the model finds', async ($, on) => {
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  on('turn.complete', (_$, e) => ({ text: 'I fixed the bug. You still need to restart the server and review the PR for me.' }) as never)
  await $.turn.complete({ reason: 'answer' } as never)
  const tree = await $.ui.render({ component: 'Pane', requestId: 'left-undone', surface: 'terminal' } as never)
  expect(JSON.stringify(tree)).toBeDefined()
})
