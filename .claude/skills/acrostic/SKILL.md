---
name: acrostic
description: Draw random starting letters for each paragraph and sentence, then write prose that obeys them. Use when the user asks for creative writing, copy, marketing text, or an about/landing page, or says "acrostic", "/acrostic", or asks to redraw letters for text. The constraint breaks the model's default phrasing patterns and kills LLM-slop cadence.
---

# Acrostic

Writing is drawn against random constraints so the prose can't fall into the usual openers
("There's no X and no Y", "Whether you're a...", parallel negation pairs). Every sentence has to
start with an assigned letter, so each one gets rebuilt rather than autocompleted.

## Run it

```
node .claude/skills/acrostic/acrostic.mjs 11        # 11 paragraphs, one sentence each
node .claude/skills/acrostic/acrostic.mjs 3,1,2     # 3 paragraphs of 3, 1 and 2 sentences
```

Output is one line per paragraph:

```
paragraph 1: a d t
paragraph 2: o
paragraph 3: t e
```

Letters are weighted by English frequency (1/rank), so `e` and `t` are common and `x`, `q`, `z`
are rare but do land.

## How to use it

1. Count the paragraphs in the target text and how many sentences each should have. If the user
   gave no shape, pick one that fits the piece and say what you picked.
2. Run the script once. Use that draw, no rerolling for an easier letter.
3. Write each sentence starting with its assigned letter, in order.
4. Report the draw as a table mapping letters to what each sentence opens with, so the user can
   check it.

Rules while writing:

- The letter constraint never outranks meaning. A sentence that reads as forced is a failed
  sentence; rewrite it, don't ship the awkward one.
- A hard letter usually has an escape hatch: a proper noun, the product name, a normal word most
  writers forget ("Zero", "Every", "Come"). Look before giving up.
- If a letter can't work after real effort, say which one and rerun for that slot only.
- Keep the voice warm and plain. The constraint is for freshness, not for showing off.

## Check

```
node .claude/skills/acrostic/acrostic.mjs --check
```
