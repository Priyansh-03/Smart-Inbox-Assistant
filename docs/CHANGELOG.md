# Changelog

Each entry = one commit hash, for rollback.

| Hash | Scope | Notes |
|------|-------|-------|
| d99d540 | T0-T1 scaffold | repo skeleton, docker-compose, MongoDB init, backend + ai-service + frontend skeletons, unit tests, docs |
| cb28a5f | docs | changelog hash record |
| 3168233 | frontend | pinned package-lock.json |
| _this_ | verify | full local build green: ai-service 9/9 pytest, backend `mvnw test` 3/3, `ng build` clean, `docker compose build backend` produces jar |
