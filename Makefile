SHELL := /bin/bash
ENV ?= .env

.PHONY: help env up down logs test test-ai test-backend test-e2e seed report

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

env: ## create .env from template if missing
	@test -f $(ENV) || cp .env.example $(ENV) && echo "wrote $(ENV) - fill it in"

up: ## build and start the full stack
	docker compose --env-file $(ENV) up --build -d

down: ## stop the stack
	docker compose --env-file $(ENV) down

logs: ## tail all logs
	docker compose --env-file $(ENV) logs -f

test: test-ai test-backend ## run all unit suites

test-ai: ## ai-service unit tests (no network)
	cd ai-service && . .venv/bin/activate && python -m pytest

test-backend: ## backend unit tests
	cd backend && ./mvnw -q test

test-e2e: ## end-to-end tests against a running stack
	cd tests/integration && python -m pytest -q

seed: ## push all sample emails through the import endpoint
	curl -s -X POST "$${API_BASE_URL:?set API_BASE_URL}/api/import/eml-dir" \
	  --data-urlencode "path=$$(pwd)/sample-data/emails" | tee /dev/stderr

report: ## print the batch timing report
	curl -s "$${API_BASE_URL:?set API_BASE_URL}/api/batch/report"
