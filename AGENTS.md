# Project Development Rules

## Node-by-Node User Verification

For every development node, complete an end-to-end user-path test before beginning the next node.

- Test the node through the interface a user or caller actually uses, not only through internal functions.
- Verify the expected success state and at least one relevant failure state.
- Record the command or test used and its result in the handoff or commit summary.
- If user-path testing fails, fix the current node and re-test it before starting any later node.
- Never connect automated tests to New Wisdom production data unless the user has explicitly authorized the exact read-only scope for that test.
