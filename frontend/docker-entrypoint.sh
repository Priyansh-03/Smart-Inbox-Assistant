#!/bin/sh
# Inject the backend URL at container start so the image needs no rebuild per environment.
set -e
: "${API_BASE_URL:?API_BASE_URL is required}"
echo "window.__API_BASE__ = \"${API_BASE_URL}\";" > /usr/share/nginx/html/env.js
echo "frontend: API base set to ${API_BASE_URL}"
