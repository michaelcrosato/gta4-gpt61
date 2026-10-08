#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
command -v python3 >/dev/null
command -v gh >/dev/null
gh auth status
git config --local core.hooksPath .githooks
git config --local alias.publish '!python3 scripts/publish.py'
git config --local repo.autoPublish true
git config --local fetch.prune true
git config --local pull.ff only
printf '%s\n' 'Automatic publishing enabled for this clone. Each commit queues a checked PR merge.'
