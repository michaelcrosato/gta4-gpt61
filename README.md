# gta4-gpt61

Project repository for [michaelcrosato/gta4-gpt61](https://github.com/michaelcrosato/gta4-gpt61).
Includes the supplied `my-3d2dge-agent.js` rendering/game engine. A game entry
point and application development stack have not been added yet.

## Setup

Requires Git, [GitHub CLI](https://cli.github.com/), and Python 3.11 or newer on
Linux, WSL, or macOS. Authenticate with `gh auth login`, then run:

```sh
git clone https://github.com/michaelcrosato/gta4-gpt61.git
cd gta4-gpt61
./scripts/setup-local.sh
```

The setup installs repository-local hooks, the `git publish` alias, automatic
fetch pruning, and fast-forward-only pulls. Run it once in each new clone.

## Commit and publish

```sh
git add <files>
git commit -m "Describe the change"
```

Every commit automatically pushes its committed snapshot to
`publish/<local-branch>`, creates or updates a pull request into `main`, and
enables auto-merge. GitHub waits for the required `Repository checks` CI job,
merges, and deletes the remote publication branch. Local files, your index, and
your checked-out branch are left untouched. Commits on local `main` also follow
this PR workflow; the hook never pushes directly to GitHub's protected `main`.

Publishing takes a few network requests during the commit. CI and merging happen
on GitHub after the commit command returns. A failed push or check leaves your
commit saved locally. Resolve the reported problem and retry:

```sh
git publish                 # Push/update the PR and queue its merge
git publish --wait          # Also wait up to 10 minutes for the merge
git pull --ff-only          # Update local main after its PR has merged
```

When using a local working branch, switch to `main` before pulling. Once its
commits are on `main`, delete that local branch with `git branch -d <branch>`.
GitHub retains merged PR records; branch deletion is the automatic cleanup.
Merge commits preserve local commit ancestry so repeated commits from the same
branch work after the remote branch is deleted.

Publishing requires write access to this repository and a named local branch.
Other contributors can push to their forks and open PRs using GitHub's normal
workflow. Public contributions are not automatically approved or merged.

```sh
SKIP_AUTO_PUBLISH=1 git commit -m "Keep this commit local for now"
git config --local repo.autoPublish false   # Disable the hook's publication
git config --local repo.autoPublish true    # Enable it again
```

## Verification

```sh
python3 -m unittest discover -s tests -v
node --check my-3d2dge-agent.js  # Requires Node.js
git diff --check
for script in .githooks/post-commit scripts/setup-local.sh scripts/setup-github.sh; do
  bash -n "$script"
done
```

CI runs the publication tests and JavaScript/shell syntax and whitespace checks
on PRs and `main`.
Add application build, lint, and test commands here and to CI when choosing the
development stack. See [AGENTS.md](AGENTS.md) for UI verification tools.

## Repository maintenance

The repository has issue forms, a PR template, code ownership, editor and Git
formatting rules, and [contribution](CONTRIBUTING.md) and [security](SECURITY.md)
guidance. Actions are pinned to verified release commits and updated weekly by
Dependabot. CI uses read-only permissions and does not need repository secrets.

`main` requires a PR, passing CI from GitHub Actions, and resolved conversations.
Protection also applies to administrators; force pushes and deletion are
disabled. Independent approval is not required for the owner's automatic commit
workflow. Secret scanning, push protection, Dependabot alerts/security fixes, and
private vulnerability reporting are enabled.

An administrator can reapply settings with `./scripts/setup-github.sh`. Its
versioned inputs are [.github/repository-settings.json](.github/repository-settings.json)
and [.github/branch-protection.json](.github/branch-protection.json).

No license has been selected for this project's original code yet. The supplied
engine retains its upstream MIT license in [LICENSES/my-3d2dge.txt](LICENSES/my-3d2dge.txt).
