# Changelog

Each entry = one commit hash, for rollback.

| Hash | Scope | Notes |
|------|-------|-------|
| d99d540 | T0-T1 scaffold | repo skeleton, docker-compose, MongoDB init, backend + ai-service + frontend skeletons, unit tests, docs |
| cb28a5f | docs | changelog hash record |
| 3168233 | frontend | pinned package-lock.json |
| de62134 | verify | full local build green: ai-service pytest, backend `mvnw test` 3/3, `ng build` clean, `docker compose build backend` produces jar |
| _this_ | ai: OpenAI | swapped AI service from Anthropic/Claude to OpenAI (`gpt-4o`, JSON mode); llm.py, config.py, prompts unchanged, env keys `OPENAI_API_KEY`/`OPENAI_MODEL`, tests updated (10/10 green) |
