# Contributing

Keep changes focused and explain the problem they solve. Open an issue first for
large changes or changes that introduce a new dependency or development stack.

## Development workflow

1. Start from an up-to-date `main` and create a descriptive working branch.
2. Make the change and update relevant documentation.
3. Run the checks described in [README.md](README.md) and any tests relevant to
   the change. UI changes also need small-phone, tablet, wide-screen, and WebKit
   checks, as described in [AGENTS.md](AGENTS.md).
4. Commit the change with a short message that explains its purpose. After setup,
   the post-commit hook runs `git publish` automatically: it pushes the committed
   SHA to `publish/<local-branch>`, creates or reuses a pull request, and requests
   automatic merging once the checks pass.
5. Run `git publish --wait` when you need to wait for the pull request to merge.
   GitHub uses a merge commit and deletes the remote publication branch. Your
   local branch and working files stay unchanged.

After merging, switch to `main` and run `git pull --ff-only`. You can then delete
a merged local working branch with `git branch -d <branch>`.

The `Repository checks` check must pass before merging into `main`. Pull requests
should describe the resulting behavior and include the commands used to verify
it. Do not commit credentials, local environment files, dependencies, generated
reports, or build output. Keep dependency lockfiles under version control when
a development stack is added.

If publishing fails, the local commit remains. Fix the reported issue and run
`git publish` again. See [README.md](README.md) for setup and the configured
commit behavior.

## Reporting issues

Use the bug or feature issue template and include enough detail to reproduce the
problem. Report security concerns privately using [SECURITY.md](SECURITY.md).
