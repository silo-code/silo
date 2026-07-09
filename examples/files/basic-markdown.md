---
title: Basic Markdown examples
status: reference
tags:
  - markdown
  - preview
---

# Basic Markdown examples

A sampler of everyday Markdown syntax for exercising Markdown Preview's core
rendering — headings, emphasis, lists, tables, links, images, and code — as a
companion to [mermaid-diagrams.md](./mermaid-diagrams.md), which covers
diagrams specifically. The block above this heading is YAML frontmatter; it
renders as a small key/value table instead of raw text.

## Headings

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

## Emphasis

Plain text, **bold text**, _italic text_, **_bold and italic_**, and
~~strikethrough~~ (GitHub-flavored). You can also use `inline code` inline
with a sentence.

## Lists

Unordered, with nesting:

- First item
- Second item
  - Nested item A
  - Nested item B
    - Deeply nested item
- Third item

Ordered:

1. Read the proposal
2. Leave review comments
3. Approve or request changes

Task list (GitHub-flavored — renders as real checkboxes):

- [x] Draft the RFC
- [x] Get feedback from the team
- [ ] Update the roadmap
- [ ] Ship it

## Blockquotes

> A single-level blockquote, for pulling out a quote or a callout.
>
> > A nested blockquote inside it, for a quoted reply or aside.

## Code

Inline: use `ctx.storage.workspace.get(key)` to read a persisted value.

A fenced block with a language tag (syntax highlighting isn't applied — this
previewer renders code blocks in plain monospace — but the language tag is
preserved in the source):

```typescript
interface Booking {
  id: string;
  scheduledAt: Date;
  status: "draft" | "confirmed" | "cancelled";
}

function isUpcoming(booking: Booking): boolean {
  return booking.status === "confirmed" && booking.scheduledAt > new Date();
}
```

A fenced block with no language:

```
plain text in a code fence, no language tag
```

## Tables

| Feature       | Supported | Notes                           |
| ------------- | :-------: | ------------------------------- |
| Headings      |    ✅     | h1–h6                           |
| Tables        |    ✅     | GitHub-flavored (remark-gfm)    |
| Task lists    |    ✅     | Rendered as real checkboxes     |
| Mermaid       |    ✅     | See mermaid-diagrams.md         |
| Syntax colors |    ❌     | Code renders in plain monospace |

## Links

- External: [Mermaid's documentation](https://mermaid.js.org)
- Email: [dweaver@servicetitan.com](mailto:dweaver@servicetitan.com)
- Same-document anchor: [jump to Tables](#tables)
- Another file in this workspace: [mermaid-diagrams.md](./mermaid-diagrams.md)

## Images

A local image, loaded from disk via the workspace's file reader:

![A simple flat mountain illustration on a dark background](./mountains.png)

## Horizontal rule

Some text above a rule.

---

Some text below it.

## Wrapping up

Everything above this line exercises the "plain" side of Markdown Preview;
pair it with [mermaid-diagrams.md](./mermaid-diagrams.md) for the diagram
side.
