---
name: loop
description: Run a prompt continuously until completion, or repeat it at a fixed interval in the current Pi session.
---

# Loop

Use the global Pi loop extension for work that requires more than one agent run.

## Start a continuous loop

Run this command:

```text
/loop <prompt>
```

A continuous loop starts the prompt immediately. It starts another turn after each settled agent run.

The loop stops after three hours without a verified milestone. Pi then requests a blocker report.

This command matches the Cursor-style goal loop:

```text
/loop until done. if you're truly stuck after a few hours, stop and write up why.
```

## Start a fixed loop

Put the interval before the prompt:

```text
/loop 5m check CI
```

You can put the interval after the prompt:

```text
/loop check CI every 5 minutes
```

Use `s`, `m`, `h`, or `d`. The minimum interval is one second.

## Control the loop

Show the current state:

```text
/loop-list
```

Stop the active loop:

```text
/loop-stop <reason>
```

You can also use `/loop status` and `/loop stop <reason>`.

Only one loop can run in a session. A replacement requires confirmation.

## Agent protocol

Call `loop_progress` after a concrete, verified milestone.

Call `loop_done` only after all requirements are complete and verified.

Call `loop_stop` only when no productive route remains.

After `loop_stop`, report the attempts, evidence, blockers, and required next action.

Do not call `loop_done` after one fixed check. Call it only when the recurring monitor must end.

## Persistence

The extension stores loop state in the current session. A session resume restores the loop and its next wake time.

The loop does not create a subagent. Each iteration stays in the current conversation context.
