---
name: fypms-git-recovery
description: Safe git recipes for the FYPMS branch-per-prompt workflow - undo or redo a prompt's commit, uncommit while keeping files, revert pushed commits, stash, move work between branches, and recover with reflog. Use when the user asks to uncommit, roll back, redo a prompt, undo a merge or fix a git mistake.
---

# Safety rules
- Inspect first, always: `git status`, `git log --oneline --decorate -10`, `git branch -vv`, and `git branch -r --contains <sha>` (is the commit pushed?).
- Show the plan (exact commands and what will be lost) and get the user's explicit yes before any destructive command (`reset --hard`, `branch -D`, `clean`, `push --force`).
- Before any reset, delete or force push create a backup: `git branch backup/<name>-<date>`.
- Never rewrite history that is pushed or shared; use `git revert`. Force push only your own feature branch and only with `--force-with-lease`.
- Never touch `main` history. Commit messages come from `docs/prompts/commits/<id>.txt` (`git commit -F`).

# Decision guide
| Situation | Do |
|---|---|
| Uncommitted edits in the way | `git stash -u` (restore with `git stash pop`) or `git restore <file>` to discard |
| Last commit unpushed, redo the prompt on a clean branch (preferred with branch-per-prompt) | `git switch main` then `git branch -m <branch> backup-<branch>` then `git switch -c <branch>` |
| Last commit unpushed, move this branch back in place | `git branch backup-<branch>` then `git reset --hard <good-sha>` |
| Uncommit but keep the files | `git reset HEAD~1` (unstaged) or `git reset --soft HEAD~1` (staged) |
| Fix only the last commit message, unpushed | `git commit --amend -F <file>` |
| Commit already pushed or shared | `git revert <sha>` (range: `git revert <old>..<new>`) then a normal push |
| Wrong branch | `git switch <right-branch>` then `git cherry-pick <sha>`; remove from the wrong branch with a backup + reset |
| Lost commits after a reset | `git reflog`, then `git branch rescue <sha>` or `git reset --hard HEAD@{n}` |
| Merge conflict mid-merge, want out | `git merge --abort` (or `git rebase --abort`) |

# Redo-a-prompt workflow
1. Make the working tree clean (stash or commit).
2. Back up and recreate the branch (row 3 above), confirm with `git log --oneline -3`.
3. Apply any doc/skill/prompt updates first and commit them (`git commit -F docs/prompts/commits/docs-<id>.txt`).
4. Re-run the prompt, run its `verify` commands, commit with its message file.
5. After the redo is accepted, delete the backup: `git branch -D backup-<branch>`.

# Reply style
Plain language, numbered commands in a code block, one line saying what each step does and how to undo it.
