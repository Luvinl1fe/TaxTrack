# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Working agreement

Branch per milestone → PR → squash-merge to `main` after review. **Nothing is
committed or pushed without being asked.**

## Stacked PRs

When a milestone splits into groundwork plus feature, base the second PR on the
first branch so its diff is only the new work. Then merge in this order:

1. Merge the base PR **without** `--delete-branch`.
2. Retarget the child PR to `main` (`gh pr edit <n> --base main`).
3. Rebase the child's own commits onto the new `main`, so the base PR's squashed
   content isn't duplicated:
   `git rebase --onto origin/main <old-base-sha> <child-branch>`
4. Only then delete the base branch.

**GitHub does not retarget a stacked PR for you.** Deleting the base branch as
part of the merge *closes* the child PR, and it cannot be reopened once its head
has been force-pushed — the work then needs a fresh PR. This cost a PR number on
30 July 2026 (#5 → #6).
