# opencode-tps-counter

A live **tokens-per-second** meter for the [OpenCode](https://opencode.ai) TUI. It renders to the right of the session composer and tells you how fast the current model is generating.

## States

The readout has three states:

| When | Shows |
| --- | --- |
| Tokens are streaming | `45.2 tok/s` |
| The agent is busy but not streaming text (a tool/command is running) | `…` |
| The session is idle | `Last: 45.2 tok/s` |

So during a turn you watch the live rate, it drops to `…` while a tool runs, picks back up when text resumes, and settles on `Last:` once the turn ends.

## Install

Drop the plugin into your OpenCode plugin directory:

```sh
curl -fsSL https://raw.githubusercontent.com/vaporwavie/opencode-tps-counter/main/tps-counter.tsx \
  -o ~/.config/opencode/plugin/tps-counter.tsx
```

Restart OpenCode (the TUI loads plugins at startup). That's it — the meter appears next to the composer on the next response.

## How it works

OpenCode emits a `message.part.delta` event for every streamed text chunk. The plugin estimates tokens from each chunk (~5 UTF-8 bytes per token), keeps a 5-second sliding window of samples per session, and divides tokens by elapsed time for a live rate. On `message.updated` (assistant message completed) it clears the window and keeps showing the last rate as `Last:`.

The token figure is an **estimate** — OpenCode doesn't expose exact per-chunk token counts mid-stream, so the bytes-per-token heuristic is tuned for prose. Code-heavy output will read a little differently; adjust the divisor in `tps-counter.tsx` if you want to calibrate it to your usage.

Every event handler is wrapped so a malformed event can never throw into OpenCode's dispatch — a stray exception there would otherwise wedge the TUI.

## Requirements

- OpenCode `>= 1.17`

## License

[MIT](./LICENSE) © Luiz Nickel
