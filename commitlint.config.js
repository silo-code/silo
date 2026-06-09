// Conventional Commits enforcement (commit-msg hook + CI PR-title check).
// We also do local `--no-ff` merges straight to main (not squash-only), so we
// lint merge subjects too: commitlint's default ignores would otherwise skip
// any "Merge ..." message, which let non-conventional merge commits land. Keep
// skipping rebase autosquash (fixup!/squash!) and git's default revert message.
export default {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: false,
  ignores: [(m) => /^(fixup|squash)!/.test(m), (m) => /^Revert /.test(m)],
};
