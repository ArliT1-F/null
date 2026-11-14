# Development helpers

These scripts exist to exercise authenticated flows from the command line during
development. They are **not** part of the application and must never be run
against a production database.

| Script | Purpose |
| --- | --- |
| `dev-seed-demo.ts` | Creates one demo account (`arlit1` / `test-password-123`) with a bio. |
| `dev-publish-demo.ts` | Adds sample links to that account and publishes version 1. |
| `dev-session.ts <username>` | Prints a raw session token so `curl -H "Cookie: vessel_session=..."` works. |

Run them with the project's path aliases and environment:

```bash
NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env scripts/dev/dev-session.ts arlit1
```

`NODE_OPTIONS=--conditions=react-server` is required because the scripts import
server modules guarded by the `server-only` marker package.
