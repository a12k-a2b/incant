# Stable Incant checkpoint — 2026-09-11

Owner asked to preserve the app that is working well, referring to the successful four-people-eating-around-a-floor-table cast. This checkpoint records the current deployed implementation. The precise build that produced that earlier screenshot has not been independently identified; do not claim that screenshot proves every later feature.

- Name: `incant-stable-2026-09-11`
- Application source: `f9e9d19` (full revision available from the annotated Git tag).
- Verified live Railway deployment: `a3a38b62-612b-4ab0-87a6-bf2c2a3ed331`, SUCCESS.
- Service: incant-web; project: 5196b8dc-8213-41c1-9e23-72f3c68b3494.
- Persistent backup volume: ec7b4c53-48a3-414f-804c-e74164febb70, /data.
- Includes current cloud backup, See-through default, repeated casts from the same sketch, source comparison corner, spellbooks, native share, and hourglass.
- Evidence: docs/evidence/cloud-backup-production.json and docs/evidence/qa-cloud-backup/. Automated build and 47 tests passed. Device backup status and native share verified. Intermittent wand interruption was not reproduced and remains a manual follow-up; this is not a claim that every hardware edge case passed.

Local recovery bundle: `/Users/anjan/Documents/SolOS/incant-recovery/incant-stable-2026-09-11.bundle`. This contains the tagged source and Git history, not secrets or the user's cloud image archive. It is an additional local copy, not an off-device backup. The package lock and Dockerfile pin the application dependency resolution and build recipe; the Node 22 base image remains a moving tag. Railway's successful deployment retains the built service image while its retention policy allows it.

## Restore procedure, when requested

1. Preserve the current branch and any uncommitted work. Create a separate worktree at `incant-stable-2026-09-11`, or clone the recovery bundle if the original repository is unavailable. Do not reset or clean the user's active checkout.
2. Run `npm ci`, build and the affected QA checks in the recovered source. Compare to the stored evidence; provider availability and current hardware behavior still require verification.
3. Prefer redeploying the preserved successful Railway image if available. Otherwise deploy the recovered web directory to the same incant-web service. Retain its environment variables and persistent volume. Never delete, replace or initialize the volume as part of a code rollback.
4. Verify room access, a saved sketch/generation readback, and the core tablet interactions. Do not clear browser data: local draft and archive storage are independent of the code checkpoint.

The image provider is external; restoring app code cannot guarantee identical generated images or freeze future provider behavior. Existing generations remain saved as their actual image bytes.
