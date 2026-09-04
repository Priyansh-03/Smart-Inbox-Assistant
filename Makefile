SHELL := /bin/bash

# `make up` uses .env ; `make up LOCAL=1` uses .env.local. Same for down/logs/seed/report.
FLAG := $(if $(LOCAL),-local,)

.PHONY: help up down logs ps test test-ai test-backend test-e2e seed report

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-13s %s\n", $$1, $$2}'

up:            ## build + start the stack        (LOCAL=1 -> .env.local)
	./run.sh $(FLAG) up

down:          ## stop the stack
	./run.sh $(FLAG) down

logs:          ## tail all logs
	./run.sh $(FLAG) logs

ps:            ## container status
	./run.sh $(FLAG) ps

test: test-ai test-backend  ## run both unit suites

test-ai:       ## ai-service unit tests (no network)
	cd ai-service && . .venv/bin/activate && python -m pytest

test-backend:  ## backend unit tests
	cd backend && JAVA_HOME=$${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64} ./mvnw -q test

test-e2e:      ## end-to-end tests against a running stack
	./run.sh $(FLAG) test-e2e

seed:          ## push sample emails through the import endpoint
	./run.sh $(FLAG) seed

report:        ## batch timing report
	./run.sh $(FLAG) report
