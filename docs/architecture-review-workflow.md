# Architecture-review workflow

How a human drives an architecture review end to end. The review itself is a
skill (`.agents/skills/silo-architecture-review/SKILL.md`) — this is the loop
around it: who runs what, in which session, and what to check before acting on
the result.

Use it when a change is worth an architectural look: a cross-cutting PR, a
public SDK surface change, or an existing subsystem you suspect has drifted.
Small localized changes don't need any of this.

**You don't have to drive it by hand.** The
`silo-architecture-review-orchestrator` skill runs this loop with you: it holds
the state in a `/tmp` file, hands you each prompt to paste into a fresh session,
verifies the citations and artifacts that come back, and re-plans when a fixer
rejects a finding. It never reviews or fixes anything itself, so the session
split below is preserved. Read on for what it's doing and why.

## The loop

### 1. Review

Fresh session, in the tree holding the changes. Invoke the
`silo-architecture-review` skill, or paste a prompt naming what to review.

**Not the session that wrote the code.** An author cannot see its own blind
spots: it knows the parts it left implicit and fills them in while reading, so
the gap a newcomer would hit is invisible from inside the work. In practice the
best findings are the ones only a fresh reader can have — "the docs tell an
extension author to do X, and X is impossible."

### 2. Spot-check the findings

Yours, and it takes minutes. You are not re-reviewing — you are testing whether
the citations survive a `grep`.

Every finding carries `file:line` plus the ADR it violates, and is marked
`CONFIRMED` or `INFERRED`. Aim at:

- Anything marked **`INFERRED`** — the reviewer has told you which link it
  didn't re-verify.
- **Symbol names in the headline finding.** These are what the implementer will
  grep for, and a name reconstructed from memory of a diff is the most common
  error in an otherwise-correct report.
- Any claim about a **file the diff didn't touch** — a baseline fact asserted
  from memory rather than read.

A finding whose chain checks out is one you can hand off. A wrong citation does
**not** mean the finding is wrong; correct the citation and keep the finding.

### 3. Read the phase plan

The review's last step groups the follow-ups into landable phases with a
paste-ready handoff prompt for each. Sanity-check the ordering against what you
know — you have context the reviewer doesn't (what's already in flight, what
release is near).

### 4. Run each phase

Fresh session per phase. Paste the handoff prompt unmodified.

**Not the reviewer.** It is your only independent record of why the findings are
right; once it starts editing, it verifies its own fix against its own
reasoning and you've lost the check. Keep it clean so you can re-run it in
step 5.

Each prompt ends by giving the implementer permission to reject the finding. If
it does — **believe it**. The reviewer worked from a diff; the implementer has
the whole file open. That's the loop working, not failing. Go back to step 2
with what it found.

**Verify each phase before starting the next.** A phase can report success and
have quietly skipped part of the work; if you only find out at step 5 you've
built the next phase on top of it. Four checks:

1. **The artifact exists** — `grep` for the field, method, ADR line, or glossary
   entry the phase was supposed to produce. Don't take "done" on faith.
2. **The gates pass** — `pnpm test`, `pnpm lint`, `tsc --noEmit`.
3. **The obligations were met** — a public-surface phase owes the full
   `silo-docs-sync` workflow, which means a regenerated API page, not only
   TSDoc.
4. **Ask whether the implementer disagreed** with any part of the finding. A
   rejection changes the plan; a silent skip needs a corrective prompt to the
   same session rather than a restart.

### 5. Re-run the review

Fresh session, same prompt as step 1. Confirms the findings actually closed,
and doubles as a regression test of the skill against a change where you
already know the answer.

### 6. PR

## Why the sessions are separate

Three roles — **author → reviewer → fixer** — and the handoff between each is a
fresh session. What each role gains is the _absence_ of the previous one's
context, not a different model:

- The **author** is invested in the shape it chose and knows too much.
- The **reviewer** must be able to read the work as a stranger would.
- The **fixer** must be able to disagree with the review.

Collapsing any two of these loses the property that makes the next one useful.

## When to stop

The loop does not terminate on its own. A good review of a real change against
this many ADRs will always find _something_, so "review until clean" is not a
stopping condition — it's an infinite regress, and each additional round is less
valuable than the one before it.

**Re-review once (step 5), then exit.** From that re-review, act only on
findings that meet one of two bars:

- **A durable artifact is wrong.** A collapsed proposal that omits what
  shipped, an ADR that now reads as contradicting the code, a glossary term
  defined incorrectly. These are permanent records, and a wrong permanent record
  costs more the longer it stands.
- **A deadline makes it un-retractable.** Most often a public SDK surface
  detail that becomes a published contract at the next release.

Everything else — cosmetic consistency, an optional cleanup, a pre-existing
issue the change merely brushed against — goes to ordinary code review, an
issue, or nowhere. Say so explicitly rather than leaving it implicitly deferred.

Then **verify those last fixes by hand** (grep the TSDoc, read the proposal's
"What shipped") rather than running a third review. You are not looking for new
findings at that point; you are confirming two known edits landed.

The principled version of the rule: exit when the remaining findings are, by
construction, less urgent than the ones you already fixed.

## Model choice

**Opus at every step.** This is measured, not assumed: on a change with four
real findings, Opus found all four; Sonnet, given the identical prompt and
skill, found none and returned "No concerns — zero follow-ups."

The findings this skill exists to catch are multi-hop — the defect lives in the
relationship between four files and is stated in none of them. That appears to
be a model capability rather than a prompt capability; the skill transferred
its _structure_ to the smaller model perfectly and its _judgment_ not at all.

The same asymmetry applies to the fixer on anything that becomes durable: a
public SDK surface, or an ADR amendment that outlives everyone who remembers
the discussion.

## Trust the process, not the output

Reviews are not authoritative. They are **falsifiable**, which is better — and
only because every finding cites an exact location. That's what makes step 2
cost minutes instead of an hour.

The asymmetry that matters:

- A **false positive** is cheap. One `grep` and it's gone.
- A **false negative** is invisible. There is nothing to check.

So a clean bill of health deserves **more** suspicion than a long findings
list, not less. A review that reports no concerns on a substantial change is
either correct or useless, and nothing in the report itself tells you which.
That is the single strongest reason not to economize on the review step.
