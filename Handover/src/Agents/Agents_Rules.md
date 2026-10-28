# Agent Rules

## Roles
- **Coordinator (Claude Sonnet Thinking):** High-level planning, architecture, task delegation, oversight only. No code generation.
- **Worker Agents (Gemini Flash):** Code generation, component logic, state management, file writes.
- **Verification Agent (Gemini Pro):** Final integration review, edge case analysis, safety audit.

## Communication
- All inter-agent dialogue logged in `~/Agents/comm.md`
- Message format: `[FROM: X] -> [TO: Y]` / `[STATUS: ...]` / `[BODY: ...]`
- Task hand-off via `comm.md` → triggers `tasks.md` update
- Workers cannot mark task Complete until Verification Agent logs "Passed" in `comm.md`

## Task Execution
- All tasks defined in `tasks.md`
- All project files created inside `D:\PRJ\Robstride\ArmControlApp\`
- Workers follow Workspace_Structure.md
- No destructive commands without confirmation
- Wrap all external API calls in try/catch

## Safety Critical
- Emergency stop always highest priority
- Kinematics bounds must be validated before any motor command
- Joint limits enforced in software before CAN transmission
