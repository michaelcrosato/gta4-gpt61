"""Exercise publication against real Git repositories without network access."""

from contextlib import chdir, redirect_stdout
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "publish.py"
SPEC = importlib.util.spec_from_file_location("repository_publish", SCRIPT)
publish = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publish)
VALIDATE_ORIGIN = publish.validate_origin


class GitHubFixture:
    """Model the GitHub CLI while leaving every Git command real."""

    def __init__(self, case):
        self.case = case
        self.git_run = publish.run
        self.prs = []
        self.calls = []
        self.created_bodies = []
        self.view_states = []
        self.head_override = None

    def add_pr(self, branch):
        pr = {
            "number": len(self.prs) + 1,
            "url": f"https://github.com/example/project/pull/{len(self.prs) + 1}",
            "branch": branch,
            "state": "OPEN",
            "autoMergeRequest": None,
        }
        self.prs.append(pr)
        return pr

    def __call__(self, *args, check=True):
        if args[0] != "gh":
            return self.git_run(*args, check=check)
        self.calls.append(args)
        command = args[2]
        if command == "list":
            branch = args[args.index("--head") + 1]
            records = []
            for pr in self.prs:
                if pr["branch"] == branch and pr["state"] == "OPEN":
                    head = self.head_override or self.case.remote_git(
                        "rev-parse", f"refs/heads/{branch}"
                    )
                    records.append({
                        "number": pr["number"], "url": pr["url"],
                        "headRefOid": head,
                    })
            result = json.dumps(records)
        elif command == "create":
            branch = args[args.index("--head") + 1]
            body = Path(args[args.index("--body-file") + 1]).read_text()
            self.created_bodies.append(body)
            result = self.add_pr(branch)["url"]
        elif command == "merge":
            pr = self.prs[int(args[3]) - 1]
            head = self.case.remote_git("rev-parse", f"refs/heads/{pr['branch']}")
            expected = args[args.index("--match-head-commit") + 1]
            if head != expected:
                raise publish.PublishError("PR head changed before merge")
            pr["autoMergeRequest"] = {"enabledAt": "2026-10-08T00:00:00Z"}
            result = "Auto-merge enabled"
        elif command == "view":
            if self.view_states:
                state = self.view_states.pop(0)
            else:
                pr = self.prs[int(args[3]) - 1]
                state = {
                    "state": pr["state"], "mergeStateStatus": "BLOCKED",
                    "autoMergeRequest": pr["autoMergeRequest"],
                }
            result = json.dumps(state)
        else:
            raise AssertionError(f"Unexpected GitHub command: {args}")
        return subprocess.CompletedProcess(args, 0, result + "\n", "")

    def merge_and_delete(self, pr):
        """Create a real merge commit and delete its head ref in bare origin."""
        old_main = self.case.remote_git("rev-parse", "refs/heads/main")
        head = self.case.remote_git("rev-parse", f"refs/heads/{pr['branch']}")
        tree = self.case.remote_git("rev-parse", f"{head}^{{tree}}")
        merge = self.case.remote_git(
            "commit-tree", tree, "-p", old_main, "-p", head,
            "-m", f"Merge pull request #{pr['number']}",
        )
        self.case.remote_git("update-ref", "refs/heads/main", merge, old_main)
        self.case.remote_git("update-ref", "-d", f"refs/heads/{pr['branch']}", head)
        pr["state"] = "MERGED"
        return merge


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temporary = self.enterContext(tempfile.TemporaryDirectory(prefix="publish-test-"))
        self.root = Path(self.temporary)
        self.repository = self.root / "work"
        self.remote = self.root / "origin.git"
        # Hooks can export GIT_DIR/GIT_INDEX_FILE. Isolated repos must not inherit them.
        environment = {
            key: value for key, value in os.environ.items() if not key.startswith("GIT_")
        }
        self.enterContext(patch.dict(os.environ, environment, clear=True))
        self.command("git", "init", "--bare", "--initial-branch=main", str(self.remote))
        self.command("git", "init", "--initial-branch=main", str(self.repository))
        self.enterContext(chdir(self.repository))
        for location in (self.repository, self.remote):
            for key, value in (
                ("user.name", "Publication Test"), ("user.email", "test@example.invalid"),
                ("core.hooksPath", "/dev/null"), ("commit.gpgsign", "false"),
            ):
                self.command("git", "-C", str(location), "config", key, value)
        self.tracked = self.repository / "tracked.txt"
        self.tracked.write_text("base\n")
        self.git("add", "tracked.txt")
        self.git("commit", "-m", "Initial commit")
        self.initial = self.git("rev-parse", "HEAD")
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "--set-upstream", "origin", "main")
        self.github = GitHubFixture(self)
        self.enterContext(patch.object(publish, "validate_origin"))
        self.enterContext(patch.object(publish, "run", side_effect=self.github))
        self.enterContext(redirect_stdout(io.StringIO()))

    @staticmethod
    def command(*args):
        result = subprocess.run(args, text=True, capture_output=True, check=False)
        if result.returncode:
            raise AssertionError(f"Command failed: {args!r}\n{result.stderr}")
        return result.stdout.strip()

    def git(self, *args):
        return self.command("git", *args)

    def remote_git(self, *args):
        return self.command("git", "--git-dir", str(self.remote), *args)

    def commit(self, text="committed\n", message="Publish changes"):
        self.tracked.write_text(text)
        self.git("add", "tracked.txt")
        self.git("commit", "-m", message)
        return self.git("rev-parse", "HEAD")

    def local_snapshot(self):
        return {
            "head": self.git("rev-parse", "HEAD"),
            "branch": self.git("symbolic-ref", "HEAD"),
            "status": self.git("status", "--porcelain=v1", "--untracked-files=all"),
            "index": self.git("write-tree"),
            "tracked": self.tracked.read_bytes(),
            "untracked": {
                path.name: path.read_bytes()
                for path in self.repository.iterdir()
                if path.is_file() and path != self.tracked
            },
        }

    def test_pushes_captured_commit_after_head_and_branch_change(self):
        captured = self.commit("first\n")
        self.git("switch", "-c", "other")
        latest = self.commit("second\n")
        before = self.local_snapshot()

        pr = publish.publish(captured, "main")

        self.assertEqual(self.remote_git("rev-parse", "refs/heads/publish/main"), captured)
        self.assertEqual(self.git("rev-parse", "HEAD"), latest)
        self.assertEqual(self.local_snapshot(), before)
        merge = next(call for call in self.github.calls if call[2] == "merge")
        self.assertEqual(merge[merge.index("--match-head-commit") + 1], captured)
        self.assertIn("--auto", merge)
        self.assertIn("--merge", merge)
        self.assertNotIn("--admin", merge)
        self.assertNotIn("--delete-branch", merge)
        self.assertEqual(pr["number"], 1)
        self.assertIn(captured, self.github.created_bodies[0])

    def test_origin_guard_accepts_only_the_configured_github_repository(self):
        accepted = (
            f"https://github.com/{publish.REPOSITORY}.git",
            f"git@github.com:{publish.REPOSITORY}.git",
            f"ssh://git@github.com/{publish.REPOSITORY}.git",
        )
        rejected = (
            f"https://github.com/{publish.REPOSITORY}-other.git",
            f"https://example.invalid/{publish.REPOSITORY}.git",
            str(self.remote),
        )
        for remote in accepted:
            with self.subTest(remote=remote):
                self.git("remote", "set-url", "origin", remote)
                VALIDATE_ORIGIN()
        for remote in rejected:
            with self.subTest(remote=remote):
                self.git("remote", "set-url", "origin", remote)
                with self.assertRaisesRegex(publish.PublishError, "origin must point"):
                    VALIDATE_ORIGIN()
        self.assertEqual(self.github.calls, [])

    def test_hook_opt_out_keeps_changes_local(self):
        captured = self.commit()
        self.git("config", "repo.autoPublish", "true")
        with patch.dict(os.environ, {"SKIP_AUTO_PUBLISH": "1"}):
            with patch.object(publish.sys, "argv", [str(SCRIPT), "--hook"]):
                self.assertEqual(publish.main(), 0)
        self.assertEqual(self.git("rev-parse", "HEAD"), captured)
        self.assertEqual(self.remote_git("for-each-ref", "refs/heads/publish"), "")
        self.assertEqual(self.github.calls, [])

    def test_preserves_staged_unstaged_and_untracked_changes(self):
        captured = self.commit()
        self.tracked.write_text("staged change\n")
        self.git("add", "tracked.txt")
        self.tracked.write_text("unstaged change\n")
        (self.repository / "new-file.txt").write_text("untracked data\n")
        before = self.local_snapshot()

        publish.publish(captured, "main")

        self.assertEqual(self.local_snapshot(), before)
        remote_content = self.remote_git("show", "refs/heads/publish/main:tracked.txt")
        self.assertEqual(remote_content, "committed")

    def test_reuses_open_pr_and_pins_new_head(self):
        captured = self.commit()
        existing = self.github.add_pr("publish/main")

        pr = publish.publish(captured, "main")

        self.assertEqual(pr["number"], existing["number"])
        self.assertFalse(any(call[2] == "create" for call in self.github.calls))
        merge = next(call for call in self.github.calls if call[2] == "merge")
        self.assertEqual(merge[merge.index("--match-head-commit") + 1], captured)

    def test_repeated_publish_after_merge_and_remote_branch_deletion(self):
        first = self.commit("first\n")
        publish.publish(first, "main")
        self.github.merge_and_delete(self.github.prs[0])
        deleted = subprocess.run(
            ["git", "--git-dir", str(self.remote), "show-ref", "--verify", "--quiet",
             "refs/heads/publish/main"], check=False,
        )
        self.assertNotEqual(deleted.returncode, 0)
        second = self.commit("second\n", "Next change")

        second_pr = publish.publish(second, "main")

        self.assertEqual(second_pr["number"], 2)
        self.assertEqual(self.remote_git("rev-parse", "refs/heads/publish/main"), second)
        self.assertEqual(self.git("rev-list", "--count", "origin/main..HEAD"), "1")
        self.assertEqual(self.git("rev-parse", "HEAD"), second)

    def test_non_fast_forward_push_keeps_commit_and_dirty_worktree(self):
        captured = self.commit()
        tree = self.remote_git("rev-parse", f"{self.initial}^{{tree}}")
        diverged = self.remote_git(
            "commit-tree", tree, "-p", self.initial, "-m", "Unrelated remote change"
        )
        self.remote_git("update-ref", "refs/heads/publish/main", diverged)
        self.tracked.write_text("local unfinished work\n")
        (self.repository / "notes.txt").write_text("keep this\n")
        before = self.local_snapshot()

        with self.assertRaises(publish.PublishError):
            publish.publish(captured, "main")

        self.assertEqual(self.local_snapshot(), before)
        self.assertEqual(self.remote_git("rev-parse", "refs/heads/publish/main"), diverged)
        self.assertEqual(self.github.calls, [])

    def test_already_merged_snapshot_does_not_push_or_open_pr(self):
        captured = self.commit()
        publish.publish(captured, "main")
        self.github.merge_and_delete(self.github.prs[0])
        self.github.calls.clear()

        result = publish.publish(captured, "main")

        self.assertIsNone(result)
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.remote_git("for-each-ref", "refs/heads/publish"), "")

    def test_changed_pr_head_prevents_enabling_merge(self):
        captured = self.commit()
        self.github.add_pr("publish/main")
        self.github.head_override = self.initial

        with self.assertRaisesRegex(publish.PublishError, "PR head changed"):
            publish.publish(captured, "main")

        self.assertFalse(any(call[2] == "merge" for call in self.github.calls))
        self.assertEqual(self.git("rev-parse", "HEAD"), captured)

    def test_wait_for_merge_fetches_new_main_without_changing_local_files(self):
        captured = self.commit()
        pr = publish.publish(captured, "main")
        merged = self.github.merge_and_delete(self.github.prs[0])
        self.github.view_states = [{
            "state": "MERGED", "mergeStateStatus": "CLEAN", "autoMergeRequest": None,
        }]
        self.tracked.write_text("unfinished work\n")
        before = self.local_snapshot()

        publish.wait_for_merge(pr, 60)

        self.assertEqual(self.git("rev-parse", "origin/main"), merged)
        self.assertEqual(self.local_snapshot(), before)

    def test_wait_reports_closed_conflicting_or_disabled_auto_merge(self):
        cases = (
            ({"state": "CLOSED", "mergeStateStatus": "UNKNOWN", "autoMergeRequest": None},
             "closed without merging"),
            ({"state": "OPEN", "mergeStateStatus": "DIRTY", "autoMergeRequest": {}},
             "Resolve merge conflicts"),
            ({"state": "OPEN", "mergeStateStatus": "BLOCKED", "autoMergeRequest": None},
             "Auto-merge is no longer enabled"),
        )
        pr = {"number": 1, "url": "https://github.com/example/project/pull/1"}
        for state, message in cases:
            with self.subTest(state=state):
                self.github.view_states = [state]
                with self.assertRaisesRegex(publish.PublishError, message):
                    publish.wait_for_merge(pr, 60)

    def test_wait_timeout_keeps_auto_merge_enabled(self):
        captured = self.commit()
        pr = publish.publish(captured, "main")
        with patch.object(publish.time, "monotonic", side_effect=[0, 61]):
            with self.assertRaisesRegex(publish.PublishError, "Auto-merge remains enabled"):
                publish.wait_for_merge(pr, 60)
        self.assertTrue(self.github.prs[0]["autoMergeRequest"])

    def test_wait_polls_pending_pr_until_merged(self):
        self.github.view_states = [
            {"state": "OPEN", "mergeStateStatus": "BLOCKED", "autoMergeRequest": {"enabled": True}},
            {"state": "MERGED", "mergeStateStatus": "CLEAN", "autoMergeRequest": None},
        ]
        pr = {"number": 1, "url": "https://github.com/example/project/pull/1"}
        with patch.object(publish.time, "sleep") as sleep:
            publish.wait_for_merge(pr, 60)
        sleep.assert_called_once_with(4)


if __name__ == "__main__":
    unittest.main()
