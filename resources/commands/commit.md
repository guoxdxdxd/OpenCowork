Draft a Conventional Commits style commit message for the current repository's uncommitted changes.

Execution requirements

- First collect enough evidence before writing the commit message.
- Inspect the current uncommitted changes: staged changes, unstaged changes, and newly added files.
- Read enough of the changed files to understand the purpose of the changes instead of relying only on filenames.
- If helpful, inspect recent commit history for repository-specific wording patterns, but the final message should follow Conventional Commits style.
- Treat any user text that follows the command as additional emphasis or constraints for the draft.
- Default scope is all current uncommitted changes.

Commit drafting rules

- Do not run `git commit`.
- Do not generate multiple alternatives unless the user explicitly asks for them.
- Produce one best candidate commit message.
- Infer the most appropriate Conventional Commits type from the actual changes, such as `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, or `style`.
- Include a `scope` only when it can be inferred clearly and usefully from the changed area. If the scope is unclear, omit it.
- Keep the subject concise, imperative, and specific.
- Add a short body only when it helps clarify the change.

Output requirements

Produce the result in this structure:

# Change Summary
- One sentence summarizing the overall purpose of the current uncommitted changes.

# Commit Message
- Provide exactly one final commit message subject line in Conventional Commits form.

# Optional Body
- If helpful, provide a short body as 1-3 bullet points or a short paragraph.
- If no body is needed, say `No body needed`.

If there are no uncommitted changes, clearly say that there is nothing to draft a commit message for and do not fabricate one.
