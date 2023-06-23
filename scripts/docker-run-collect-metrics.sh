#!/usr/bin/env bash

set -euo pipefail

# Check if DEBUG is set to true
if [[ "${DEBUG:-}" == "true" ]]; then
  set -x
fi

# Check if .env file exists
if [[ ! -f collect-metrics/.env ]]; then
  echo "configure-codeql/.env not found!"
  exit 1
fi

# Check if configure-codeql.pem exists
if [[ ! -f metrics.pem ]]; then
  echo "metrics.pem not found!"
  exit 1
fi

# Check if verify-scans.pem exists
if [[ ! -f verify-scans.pem ]]; then
  echo "verify-scans.pem not found!"
  exit 1
fi

if [[ "${DEBUG:-}" == "true" ]]; then
  echo "Running Metrics Docker container in debug mode..."
  docker run -it --rm --env-file configure-codeql/.env \
    -e DEBUG=true \
    -e INPUT_METRICS_APP_PRIVATE_KEY="$(cat metrics.pem)" \
    -e INPUT_VERIFY_SCANS_APP_PRIVATE_KEY="$(cat verify-scans.pem)" \
    ghcr.io/department-of-veterans-affairs/codeql-tools:configure-codeql
else
  echo "Running Metrics Docker container..."
  docker run -it --rm --env-file configure-codeql/.env \
    -e INPUT_METRICS_APP_PRIVATE_KEY="$(cat metrics.pem)" \
    -e INPUT_VERIFY_SCANS_APP_PRIVATE_KEY="$(cat verify-scans.pem)" \
    ghcr.io/department-of-veterans-affairs/codeql-tools:configure-codeql
fi
