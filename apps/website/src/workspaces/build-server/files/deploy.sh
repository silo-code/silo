#!/usr/bin/env bash
set -euo pipefail

echo "pulling acme/app:latest"
docker pull acme/app:latest

echo "rolling restart"
docker service update --image acme/app:latest acme_app

echo "waiting for health check"
until curl -sf https://app.acme.dev/health; do sleep 2; done

echo "deploy complete"
