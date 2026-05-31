# Devtools

## Backup vs Git — know the difference

**Backups are a safety net, not version control.**

- Take a backup before any large, risky, or wide-ranging operation — think of it as a quicksave
- Backups capture the full project state including files git ignores (env, build artifacts, etc.)
- If something goes wrong, restore brings everything back to exactly that moment
- Do not use git commits as a substitute for backups — commits are for meaningful, intentional milestones, not safety copies

**Git commits are for when a feature feels ready** — coherent, shippable (or close to it). Not for checkpointing mid-experiment.

In short: backup often, commit intentionally.

## Running a backup

Always pass a description — never run it without one or it will hang waiting for input:

```
pbackup.sh backup "description of current state"
```

The backup folder will be named `<date>_<description>`.

Good moments to backup:
- Before starting a large feature
- Before a refactor that touches many files
- Before giving Claude a complex or open-ended task
- Whenever something is working and you don't want to lose it
