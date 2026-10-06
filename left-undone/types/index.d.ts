export type Undone = { text: string; kind: 'todo' | 'open'; isFlagged: boolean }

declare module 'claude-code' {
  interface PluginState {
    'left-undone': { items: Undone[] }
  }
}
