#!/bin/sh
# Reapply the repository's documented GitHub settings; requires admin access.
set -eu
cd "$(dirname "$0")/.."
repo=michaelcrosato/gta4-gpt61
gh api --method PATCH "repos/$repo" --input .github/repository-settings.json >/dev/null
gh api --method PUT "repos/$repo/branches/main/protection" --input .github/branch-protection.json >/dev/null
gh api --method PUT "repos/$repo/actions/permissions" --input .github/actions-permissions.json
gh api --method PUT "repos/$repo/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api --method PUT "repos/$repo/vulnerability-alerts"
gh api --method PUT "repos/$repo/automated-security-fixes"
gh api --method PUT "repos/$repo/private-vulnerability-reporting"
printf '%s\n' 'GitHub repository settings and main protection applied.'
