# create-silo-extension

## 0.2.2

### Patch Changes

- No functional change — bumps past `0.2.1`, which is already published on npm
  without a matching git tag or changelog entry in this repo (an earlier
  release run appears to have published it but not completed its bookkeeping
  step). `changeset publish` keeps re-attempting `0.2.1` and npm rejects it
  every time, since a published version can never be overwritten; this failure
  was also visible as a collateral failure in unrelated `release-sdk` runs,
  since `changeset publish` processes every eligible package, not just the one
  the workflow intends to release. Cutting a new version resolves the mismatch
  without needing to reconstruct exactly why the previous release's bookkeeping
  was incomplete.
