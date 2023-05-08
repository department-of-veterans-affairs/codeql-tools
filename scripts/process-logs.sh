#!/usr/bin/env bash

set -euo pipefail
set -x

declare -A workflows
workflows["configure-codeql"]="1_Configure CodeQL.txt"
workflows["verify-scans"]="1_Verify Scans.txt"
workflows["emass-promotion"]="1_Promote CodeQL Assets.txt"

for key in "${!workflows[@]}"; do
  echo "Retrieving latest ${key} workflow run ID..."
  id=$(
    curl \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      --silent \
      --location \
      "https://api.github.com/repos/${REPO}/actions/workflows/${key}.yml/runs?per_page=1" | jq '.workflow_runs[0].id'
  )

  echo "Retrieving logs for ${key} run ID ${id}..."
  curl \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    --retry 3 \
    --output logs.zip \
    --location \
    "https://api.github.com/repos/${REPO}/actions/runs/${id}/logs"

  echo "Unzipping logs"
  unzip logs.zip

  echo "Moving log file"
  rm -f "reports/actions/${key}/logs.txt"
  mv "${workflows[$key]}" "reports/actions/${key}/logs.txt"
  git clean -ffd

  git_status_output=$(git status --porcelain)
  if echo "$git_status_output" | grep -qE "^(A|M)"; then
    echo "Staging logs"
    git config --global user.name "github-actions[bot]"
    git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git status
    git add "reports/actions/${key}/logs.txt"
    git commit -m "adding latest ${key} workflow logs"
  else
    echo "No changes to commit"
  fi
done

echo "Pushing logs"
git push
