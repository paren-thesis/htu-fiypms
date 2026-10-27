HOW TO USE THESE COMMIT MESSAGES
================================

One file per prompt: docs/prompts/commits/<prompt-id>.txt
Format: Conventional Commits (type(scope): subject, bullet body, footer).

After a prompt finishes and its verify commands pass:

  git add -A
  git commit -F docs/prompts/commits/04-01.txt

Check first with:  git status   and   git diff --staged --stat

Tips
- If the agent changed more than the prompt asked, unstage the extras
  (git restore --staged <file>) and commit them separately.
- Prompts 01-03, 06-02, 07-01, 08-02, 11-03 and 12-02 also edit
  docs/models.md and docs/fypms-docs.md (spec amendments); keep those
  edits in the same commit.
- Optional: tag each finished phase so you can roll back cleanly:

  git tag phase-00-complete   # after prompt 00-03
  git tag phase-01-complete   # after prompt 01-04
  git tag phase-02-complete   # after prompt 02-05
  git tag phase-03-complete   # after prompt 03-02
  git tag phase-04-complete   # after prompt 04-03
  git tag phase-05-complete   # after prompt 05-03
  git tag phase-06-complete   # after prompt 06-03
  git tag phase-07-complete   # after prompt 07-02
  git tag phase-08-complete   # after prompt 08-03
  git tag phase-09-complete   # after prompt 09-02
  git tag phase-10-complete   # after prompt 10-02
  git tag phase-11-complete   # after prompt 11-03
  git tag phase-12-complete   # after prompt 12-04

- ALL-COMMIT-MESSAGES.txt contains every message in order for reference.
