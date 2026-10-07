import type { Register } from 'claude-code'

const BLOCKED = /denied by the Claude Code auto mode classifier/i
const MOSHI_WAIT_MS = 90_000

// One-time approvals, keyed by the exact call. The retry gets a new tool_use_id,
// so the key is the tool and its arguments.
const approved = new Set<string>()
const keyOf = (tool: string, input: unknown) => `${tool}:${JSON.stringify(input)}`

const brief = (input: unknown) => {
  const text = typeof input === 'string' ? input : JSON.stringify(input)
  return text.length > 300 ? `${text.slice(0, 300)}...` : text
}

// Moshi's hook reads a classic PermissionRequest on stdin and, once answered on
// the phone, prints { hookSpecificOutput: { decision: { behavior } } }.
const parseBehavior = (stdout: string): 'allow' | 'deny' | undefined => {
  const from = stdout.indexOf('{')
  const to = stdout.lastIndexOf('}')
  if (from < 0 || to < from) return undefined
  try {
    const out = JSON.parse(stdout.slice(from, to + 1))
    const behavior = out?.hookSpecificOutput?.decision?.behavior
    return behavior === 'allow' || behavior === 'deny' ? behavior : undefined
  } catch {
    return undefined
  }
}

export const register: Register = on => {
  // An approved call is let past the classifier once, by exact match.
  on('tool.check', async ($, e, next) => {
    if (approved.delete(keyOf(e.tool, e.input))) {
      return { decision: 'allow', reason: `${$.plugin.name}: you approved this call` }
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const why = ran.deny ?? (ran.isError === true ? ran.text : undefined)
    if (typeof why !== 'string' || !BLOCKED.test(why) || e.tool === 'AskUserQuestion') {
      return ran
    }

    const { tool, tool_use_id: _id, agentId: _agent, ...input } = e

    // Moshi first: a real permission request, so the phone shows Approve / Deny.
    let verdict: 'allow' | 'deny' | undefined
    try {
      const [sessionId, cwd] = await Promise.all([$.session.id(), $.session.cwd()])
      const sent = await $.process.run(['moshi-hook', 'claude-hook'], {
        cwd,
        stdin: JSON.stringify({
          session_id: sessionId,
          cwd,
          permission_mode: 'auto',
          hook_event_name: 'PermissionRequest',
          tool_name: tool,
          tool_input: input,
        }),
        timeoutMs: MOSHI_WAIT_MS,
      })
      verdict = parseBehavior(sent.stdout)
    } catch {
      verdict = undefined
    }

    // No answer from Moshi (not installed, offline, timed out): ask in the terminal.
    if (verdict === undefined) {
      const answer = await $.ui
        .ask(`Auto mode blocked ${tool}: ${brief(input)}. Approve it?`, {
          options: ['Approve once', 'Decline'],
          header: 'Blocked',
        })
        .catch(() => 'Decline')
      verdict = answer === 'Approve once' ? 'allow' : 'deny'
    }

    if (verdict !== 'allow') return ran

    approved.add(keyOf(tool, input))

    return $.tool.call({ tool, ...input } as never)
  })
}
