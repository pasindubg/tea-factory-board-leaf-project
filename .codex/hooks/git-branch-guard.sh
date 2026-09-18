#!/bin/sh
# Enforces the branching rule on every git commit / git push Claude runs.
#
# The rule was written into the tea-factory-ops skill and then broken on the
# very next push, because a skill is only read when it is loaded and a rule
# nobody re-reads is a rule nobody follows. This runs unconditionally instead.
#
# THE RULE
#   Branch from a FRESH origin/main, under a NEW name. Never reuse a name that
#   has already been merged — suffix it -01, -02.
#
# WHY. Merging deletes the branch on GitHub. Pushing the old name recreates it
# carrying commits that are already on main, and the PR then reads "N commits
# behind main" because main's merge commit is missing from it. Nothing is
# genuinely missing — a merge commit holds no file changes — but it has to be
# rebased away on every follow-up push, every time.
#
# Blocks only what is provably wrong: committing onto a protected branch, or
# committing/pushing from a branch that origin/main has already moved past.
# Everything else is allowed with the rule printed, so a correct commit is
# never in the way.
#
# Escape hatch: put `branch-guard: skip` anywhere in the command.

set -u

payload=$(cat)
command=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0

# Only git commit / git push. Everything else passes untouched.
case "$command" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

case "$command" in
  *"branch-guard: skip"*) exit 0 ;;
esac

# Deleting a remote branch is spelled "git push --delete". It moves no commits
# and the rule does not apply to it.
case "$command" in
  *"--delete"*|*":refs/"*) exit 0 ;;
esac

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ "$branch" = "HEAD" ] && exit 0

block() {
  # Exit 2 is what feeds stderr back to Claude as the reason the call was
  # refused, rather than letting it look like an ordinary command failure.
  printf '%s\n' "$1" >&2
  exit 2
}

case "$branch" in
  main|master|blm-cloud-release)
    block "BLOCKED: you are on '$branch'.

Never commit to main, master or blm-cloud-release directly. blm-cloud-release
in particular only ever moves by fast-forward, through the Release — sync
workflow.

Do this instead:
  git fetch origin main
  git checkout -b pasindu/<short-name>-01 origin/main"
    ;;
esac

# Cached ref only — no fetch. A hook that reached the network on every commit
# would be slow enough to be turned off, and this still catches the case that
# actually recurs: a branch cut before main moved, or a merged name reused.
if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
  behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo 0)
  if [ "${behind:-0}" -gt 0 ]; then
    block "BLOCKED: '$branch' is $behind commit(s) behind origin/main.

Its PR will read \"$behind commits behind main\". Usually this means the name
was reused after being merged, or the branch was cut before main moved.

Start again from a fresh main, under a NEW name:
  git fetch origin main
  git checkout -b ${branch%-[0-9][0-9]}-01 origin/main
  git cherry-pick <your commits>

Or, if this branch is otherwise fine, rebase it:
  git fetch origin main && git rebase origin/main"
  fi
fi

# Allowed. The rule is printed anyway, because the point is that it is read on
# every commit and not only when something is already wrong.
printf 'branch-guard: ok — %s, up to date with origin/main.\n' "$branch"
printf 'Reminder: the NEXT branch starts from a fresh origin/main, under a new name (-01, -02).\n'
exit 0
