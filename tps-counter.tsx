/** @jsxImportSource @opentui/solid */
import { createMemo, createSignal, Show } from "solid-js"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { Event } from "@opencode-ai/sdk/v2"

const WINDOW_MS = 5000
const STALE_MS = 1500
const MIN_SPAN_MS = 250

const enc = new TextEncoder()

const tui: TuiPlugin = async (api) => {
  const samples = new Map<string, { tokens: number; t: number }[]>()
  const lastKnown = new Map<string, number>()

  const [version, setVersion] = createSignal(0)
  const [tick, setTick] = createSignal(0)

  const estimate = (text: string) => Math.max(1, Math.ceil(enc.encode(text).length / 5)) // ~5 bytes/token

  const liveTps = (sessionID: string): number | null => {
    if (api.state.session.status(sessionID)?.type === "idle") return null
    const all = samples.get(sessionID)
    if (!all || all.length === 0) return null
    const now = Date.now()
    const win = all.filter((s) => now - s.t <= WINDOW_MS)
    if (win.length === 0 || now - win[win.length - 1].t > STALE_MS) return null
    const tokens = win.reduce((sum, s) => sum + s.tokens, 0)
    const spanMs = Math.max(now - win[0].t, MIN_SPAN_MS)
    return (tokens / spanMs) * 1000
  }

  type TpsState = { kind: "live"; v: number } | { kind: "paused"; v: number } | null

  const state = (sessionID: string): TpsState => {
    const live = liveTps(sessionID)
    if (live !== null) {
      lastKnown.set(sessionID, live)
      return { kind: "live", v: live }
    }
    const last = lastKnown.get(sessionID)
    return last !== undefined ? { kind: "paused", v: last } : null
  }

  const offs: Array<() => void> = []
  // A throw inside a handler propagates into opencode's event dispatch and wedges the TUI, so isolate each one.
  const on = <T extends Event["type"]>(type: T, handler: (e: Extract<Event, { type: T }>) => void) =>
    offs.push(api.event.on(type, (e) => { try { handler(e) } catch {} }))

  on("message.part.delta", (e) => {
    if (e.properties.field !== "text" || !e.properties.delta) return
    const sid = e.properties.sessionID
    const arr = samples.get(sid) ?? []
    arr.push({ tokens: estimate(e.properties.delta), t: Date.now() })
    samples.set(sid, arr)
    setVersion((v) => v + 1)
  })

  on("message.updated", (e) => {
    const info = e.properties.info
    if (info.role === "assistant" && info.time?.completed) {
      samples.delete(e.properties.sessionID)
      setVersion((v) => v + 1)
    }
  })

  const interval = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [sid, arr] of samples) {
      const kept = arr.filter((s) => s.t >= cutoff)
      if (kept.length !== arr.length) samples.set(sid, kept)
    }
    setTick((t) => t + 1)
  }, 1000)

  api.lifecycle.onDispose(() => {
    for (const off of offs) off()
    clearInterval(interval)
  })

  const fmt = (v: number) => (v < 100 ? v.toFixed(1) : Math.round(v).toString())
  const label = (s: Exclude<TpsState, null>) => `${fmt(s.v)} tok/s`

  api.slots.register({
    slots: {
      session_prompt_right(ctx, props) {
        const s = createMemo(() => {
          version()
          tick()
          return state(props.session_id)
        })
        return (
          <Show when={s()} fallback={null}>
            <text fg={s()!.kind === "live" ? ctx.theme.current.text : ctx.theme.current.textMuted}>{label(s()!)}</text>
          </Show>
        )
      },
    },
  })
}

export default { id: "tps-counter", tui } satisfies TuiPluginModule
