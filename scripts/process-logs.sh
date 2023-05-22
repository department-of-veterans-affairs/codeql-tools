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
      --retry 5 \
      "https://api.github.com/repos/${REPO}/actions/workflows/${key}.yml/runs?per_page=1" | jq '.workflow_runs[0].id'
  )

  echo "Retrieving logs for ${key} run ID ${id}..."
  curl \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    --silent \
    --retry 5 \
    --output logs.zip \
    --location \
    "https://api.github.com/repos/${REPO}/actions/runs/${id}/logs"

  echo "Unzipping logs"
  unzip logs.zip

  echo "Moving log file"
  git status
  echo "---
layout: minimal
title: Logs - ${key}
nav_order: 50
parent: Code Scanning Governance Platform Dashboard
---

\`\`\`shell
" > "logs/${key}.md"
  cat "${workflows[$key]}" >> "logs/${key}.md"
  echo "\`\`\`" >> "logs/${key}.md"
  git clean -ffd

  if [[ `git status --porcelain` ]]; then
    echo "Staging logs"
    git config --global user.name "github-actions[bot]"
    git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
    git add "logs/${key}.md"
    git commit -m "Adding latest ${key} workflow logs"
    git status
    tree
  else
    echo "No changes to commit"
  fi

done

echo "Pushing logs"
git push
