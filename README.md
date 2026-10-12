# agent-squad

A Claude Code mod that shows each subagent as a small stick figure in a side
pane, with a progress bar and commentary that isn't meant to be taken seriously.

```
2 working · 1 done · 0 fallen

 o    scout · Explore · 1m 12s · 9 tools
/|\   "find the auth code"
/ \   [=========>........] 58%
      Found the bug. Lost the bug. Found it again.

\o/   reviewer · general-purpose · 3m 4s · 22 tools
 |    "review the diff"
/ \   [==================>] 100%
      Done! Now demands a raise.
```

- The pane opens when a subagent is spawned. `/squad` opens it by hand.
- Figures run while an agent is working, doze while it waits, cheer when it
  finishes, and fall over when it fails or is killed.
- The progress percentage is **made up**. Agents don't report progress, so it
  is estimated from tool calls and elapsed time, and it stays at 97% or below
  until the agent actually finishes.
- Finished agents stay in the pane for 15 minutes, then disappear.

## Install

In a Claude Code terminal session:

```
/plugin install agent-squad --marketplace poppydad/agent-squad
```

Answer `y` to add the marketplace and pick the **user** scope so it loads in
every repo.

## Layout

```
hooks/register.tsx    agent tracking, quips, pane rendering, /squad
tests/squad.test.ts   tests
types/index.d.ts      squad state types
```
