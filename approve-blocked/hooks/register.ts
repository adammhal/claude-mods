import type { Register } from 'claude-code'

const BLOCKED = /denied by the Claude Code auto mode classifier/i
const TRIES = 3

const blockedBy = (r: { deny?: string; isError?: boolean; text?: string }) => {
  const why = r.deny ?? (r.isError === true ? r.text : undefined)
  return typeof why === 'string' && BLOCKED.test(why)
}

export const register: Register = on => {
  // Claude Code falls back to its own permission prompt after 3 blocks in a row,
  // and that prompt is the one Moshi answers. Agents stop at the first block, so
  // the same call is retried here until the third, which is the one that asks.
  on('tool.call', async ($, e, next) => {
    let ran = await next(e)
    if (!blockedBy(ran) || e.tool === 'AskUserQuestion') return ran

    const { tool, tool_use_id: _id, agentId: _agent, ...input } = e
    for (let i = 1; i < TRIES && blockedBy(ran); i++) {
      ran = await $.tool.call({ tool, ...input } as never)
    }

    return ran
  })
}
