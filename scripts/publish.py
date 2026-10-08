#!/usr/bin/env python3
"""Publish a committed snapshot without modifying the local worktree or branches."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

REPOSITORY = "michaelcrosato/gta4-gpt61"
BASE_BRANCH = "main"


class PublishError(Exception):
    """A recoverable publication failure; the local commit remains intact."""


def run(*args, check=True):
    try:
        result = subprocess.run(
            args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=60, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise PublishError(f"Could not run {args[0]}: {error}") from error
    if check and result.returncode:
        raise PublishError(result.stderr.strip() or result.stdout.strip()
                           or f"{args[0]} exited with {result.returncode}")
    return result


def output(*args):
    return run(*args).stdout.strip()


def validate_origin():
    remote = output("git", "remote", "get-url", "origin")
    allowed = (
        f"https://github.com/{REPOSITORY}",
        f"git@github.com:{REPOSITORY}",
        f"ssh://git@github.com/{REPOSITORY}",
    )
    if remote.removesuffix(".git").rstrip("/") not in allowed:
        raise PublishError(f"origin must point to github.com/{REPOSITORY}.")


def open_pr(branch):
    return json.loads(output(
        "gh", "pr", "list", "--repo", REPOSITORY, "--base", BASE_BRANCH,
        "--head", branch, "--state", "open", "--json", "number,url,headRefOid",
    ))


def publish(commit, branch, wait=False, timeout=600):
    validate_origin()
    remote_branch = f"publish/{branch}"
    run("git", "fetch", "--prune", "origin", BASE_BRANCH)
    merged = run("git", "merge-base", "--is-ancestor", commit,
                 f"refs/remotes/origin/{BASE_BRANCH}", check=False)
    if merged.returncode == 0:
        print("The committed snapshot is already on GitHub main.")
        return None
    if merged.returncode != 1:
        raise PublishError(merged.stderr.strip() or "Could not compare commits.")

    # Push only this invocation's snapshot, including when the worktree is dirty.
    # A normal push rejects diverged remote history rather than overwriting it.
    run("git", "push", "origin", f"{commit}:refs/heads/{remote_branch}")
    prs = open_pr(remote_branch)
    if not prs:
        title = output("git", "show", "-s", "--format=%s", commit)
        with tempfile.TemporaryDirectory(prefix="gta4-publish-") as temporary:
            body = Path(temporary) / "body.md"
            body.write_text(
                f"Publish committed changes from `{branch}`.\n\n"
                f"Committed snapshot: `{commit}`.\n\n"
                "Validation: the required Repository checks workflow must pass "
                "before GitHub merges this pull request.\n",
                encoding="utf-8",
            )
            created = run(
                "gh", "pr", "create", "--repo", REPOSITORY,
                "--base", BASE_BRANCH, "--head", remote_branch,
                "--title", title, "--body-file", str(body), check=False,
            )
        prs = open_pr(remote_branch)
        if not prs:
            raise PublishError(created.stderr.strip() or "PR creation failed.")
    pr = prs[0]
    if pr["headRefOid"] != commit:
        raise PublishError("The PR head changed. Run git publish again to retry.")
    run("gh", "pr", "merge", str(pr["number"]), "--repo", REPOSITORY,
        "--auto", "--merge", "--match-head-commit", commit)
    print(f"Published {commit[:12]}: {pr['url']}")
    print("GitHub will merge after required checks pass and delete the remote branch.")
    if wait:
        wait_for_merge(pr, timeout)
    return pr


def wait_for_merge(pr, timeout):
    deadline = time.monotonic() + timeout
    while True:
        state = json.loads(output(
            "gh", "pr", "view", str(pr["number"]), "--repo", REPOSITORY,
            "--json", "state,mergeStateStatus,autoMergeRequest",
        ))
        if state["state"] == "MERGED":
            run("git", "fetch", "--prune", "origin", BASE_BRANCH)
            print(f"Merged: {pr['url']}. Local files and branches are unchanged.")
            return
        if state["state"] == "CLOSED":
            raise PublishError(f"PR was closed without merging: {pr['url']}")
        if state["mergeStateStatus"] == "DIRTY":
            raise PublishError(f"Resolve merge conflicts in {pr['url']} and retry.")
        if not state["autoMergeRequest"]:
            raise PublishError(f"Auto-merge is no longer enabled: {pr['url']}")
        if time.monotonic() >= deadline:
            raise PublishError(
                f"Still waiting on {pr['url']}. Auto-merge remains enabled; "
                "inspect its checks or run git publish --wait again."
            )
        time.sleep(4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hook", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--wait", action="store_true", help="Wait for GitHub to merge.")
    parser.add_argument("--timeout", type=int, default=600, help="Wait timeout in seconds.")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if args.hook:
        if os.environ.get("SKIP_AUTO_PUBLISH") == "1":
            return 0
        enabled = run("git", "config", "--bool", "--get", "repo.autoPublish",
                      check=False)
        if enabled.stdout.strip() != "true":
            return 0
    # Capture identity before waiting for a concurrent publisher's lock.
    commit = output("git", "rev-parse", "HEAD")
    branch = output("git", "symbolic-ref", "--quiet", "--short", "HEAD")
    lock_path = Path(output("git", "rev-parse", "--git-common-dir")) / "publish.lock"
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        publish(commit, branch, args.wait, args.timeout)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (PublishError, ValueError, KeyError) as error:
        print(f"Publishing failed: {error}\n"
              "Your commit is saved locally. Fix the issue and run git publish to retry.",
              file=sys.stderr)
        sys.exit(1)
