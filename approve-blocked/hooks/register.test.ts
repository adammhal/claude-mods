import { test, expect } from 'claude-code/testing'

const BLOCK = { deny: 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: x' }

test('a call blocked twice and then allowed runs three times and succeeds', async ($, on) => {
  let runs = 0
  on('tool.call', { tool: 'Bash' }, () => (++runs < 3 ? BLOCK : { result: {}, text: 'ran' }) as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' })
  expect(runs).toBe(3)
  expect(r.deny).toBeUndefined()
})

test('a call that stays blocked stops after three tries and keeps the denial', async ($, on) => {
  let runs = 0
  on('tool.call', { tool: 'Bash' }, () => (++runs, BLOCK) as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' })
  expect(runs).toBe(3)
  expect(r.deny).toContain('classifier')
})

test('an ordinary call runs once', async ($, on) => {
  let runs = 0
  on('tool.call', { tool: 'Bash' }, () => (++runs, { result: {}, text: 'ok' }) as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(runs).toBe(1)
})
