import { test, expect } from 'claude-code/testing'

const answer = (label: string) => (_$: unknown, e: any) =>
  ({
    result: { questions: e.questions, answers: { [e.questions[0].question]: label } },
    text: `User answered: ${label}`,
  }) as never

const BLOCK = { deny: 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: x' }

test('approving a blocked call reruns it', async ($, on) => {
  let runs = 0
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, answer('Approve once'))
  on('tool.call', { tool: 'Bash' }, () => (++runs === 1 ? BLOCK : { result: {}, text: 'ran' }) as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' })
  expect(runs).toBe(2)
  expect(r.deny).toBeUndefined()
})

test('declining leaves the denial alone', async ($, on) => {
  let runs = 0
  on('tool.check', () => ({ decision: 'ask' }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, answer('Decline'))
  on('tool.call', { tool: 'Bash' }, () => (++runs, BLOCK) as never)
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi' })
  expect(runs).toBe(1)
  expect(r.deny).toContain('classifier')
})

test('an ordinary call passes through without a question', async ($, on) => {
  let asked = 0
  on('tool.check', () => ({ decision: 'allow' }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, () => (++asked, { result: {}, text: 'x' }) as never)
  on('tool.call', { tool: 'Bash' }, () => ({ result: {}, text: 'ok' }) as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(asked).toBe(0)
})
