#!/bin/bash

set -euo pipefail

id=$(curl --silent --retry 3 --location \
--header "Accept: application/vnd.github+json" \
"https://api.github.com/repos/github/codeql-action/releases/latest" | jq -r .tag_name)

echo "Downloading CodeQL version '${id}'"
curl --silent --retry 3 --location --output "/tmp/codeql.tgz" \
"https://github.com/github/codeql-action/releases/download/${id}/codeql-bundle-linux64.tar.gz"

tar -xf "/tmp/codeql.tgz" --directory "/usr/local"
rm "/tmp/codeql.tgz"
