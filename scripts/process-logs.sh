#!/usr/bin/env bash

set -euo pipefail

echo "Retrieving latest Configure CodeQL workflow run ID..."
id=$(curl -L \
       -H "Accept: application/vnd.github+json" \
       -H "Authorization: Bearer ${ADMIN_TOKEN}"\
       -H "X-GitHub-Api-Version: 2022-11-28" \
        "https://api.github.com/repos/${REPO}/actions/workflows/${ACTION_FILENAME}/runs?per_page=1" | jq '.workflow_runs[0].id')

echo "Retrieving logs for run ID ${id}..."
curl -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"\
  -H "X-GitHub-Api-Version: 2022-11-28" \
  --retry 3 \
  --output logs.zip \
  --location \
  "https://api.github.com/repos/${REPO}/actions/runs/${id}/logs"

echo "Unzipping logs"
unzip logs.zip

echo "Staging log file"
rm -f "reports/actions/${LOG_DIRECTORY}/logs.txt"
mv ${FILENAME} "reports/actions/${LOG_DIRECTORY}/logs.txt"

echo "Staging logs"
git config --global user.name "github-actions[bot]"
git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add "reports/actions/${LOG_DIRECTORY}/logs.txt"
git commit -m "adding latest ${LOG_DIRECTORY} workflow logs"

echo "Pushing logs"
git push
