# Design — NNNN. <short title>

How the requirements will be satisfied. Include only what's useful for
implementation; don't restate the source. Working artifact — removed when the
proposal collapses (durable pieces move into the collapsed proposal or an ADR).

For one phase of a multi-phase proposal, design only that phase — later
phases' designs get their own `design.md` when their turn comes.

## Architecture

<Where this lives — package(s), extension(s) — and how the pieces fit.>

## Components

<The new or changed units and their responsibilities.>

## Data flow

<How data moves through the change; sequence of the important path.>

## APIs / interfaces

<New or changed public surface. If it touches `@silo-code/sdk`, note the
`docs-sync` workflow applies.>

## Persistence

<What is stored, where, in what shape, and how it migrates.>

## Error handling

<Failure modes and how each is handled or surfaced.>

## Testing strategy

<What gets unit-tested and how; any fixtures or helpers needed.>

## Constraints and existing decisions

<Technical constraints, and the ADRs (`docs/decisions/`) this design must
respect. List them.>
