# Tests

Run everything in one go from the repo root:

```
make test
```

| Suite | Path | Needs |
|-------|------|-------|
| AI service unit | `ai-service/tests/` | python venv only (no network) |
| Backend unit | `backend/src/test/` | JDK 21 |
| End-to-end | `tests/integration/` | full stack up (`make up`) + `ANTHROPIC_API_KEY` |

The end-to-end suite maps 1:1 to the test-case and edge-case tables in
[`docs/TODO.md`](../docs/TODO.md). Each fixture lives under `sample-data/` and its
expected classification under `sample-data/expected/`.
