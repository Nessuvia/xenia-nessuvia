#!/usr/bin/env python3
"""Contract verbs and drop filler in comments and markdown. Idempotent.

Only ever edits comment bodies (.ts/.tsx/.css) or markdown prose outside code.
Code, string literals, template literals and fenced blocks are never touched.

  python scripts/deslop.py            # print a diff
  python scripts/deslop.py --apply    # write
  python scripts/deslop.py --selftest
"""

import argparse
import difflib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Allowlist, not a denylist. Anything not under these roots is invisible to this script.
ROOTS = ["src", ".claude", "scripts"]
TOP_FILES = ["CLAUDE.md", "README.md"]
EXTS = {".ts", ".tsx", ".css", ".md"}

# check* scripts hold prose inside assert messages and test fixtures. Not worth the risk.
EXCLUDE_PARTS = {"node_modules", "dist", "assets", ".git", "resources"}
EXCLUDE_NAME = re.compile(r"^(check|LICENSE)|\.min\.|\.lock")


def files():
    seen = []
    for r in ROOTS:
        for p in (ROOT / r).rglob("*"):
            if p.suffix in EXTS and p.is_file():
                if EXCLUDE_PARTS & set(p.relative_to(ROOT).parts):
                    continue
                if EXCLUDE_NAME.search(p.name):
                    continue
                seen.append(p)
    seen += [ROOT / f for f in TOP_FILES if (ROOT / f).exists()]
    return sorted(seen)


# --- span extraction -------------------------------------------------------
# A span is (start, end) into the file text, marking prose we may rewrite.

def codeSpans(text):
    """Comment bodies in a C-like file. Scans char by char tracking quote state."""
    spans = []
    i, n = 0, len(text)
    # ponytail: a regex literal containing // or /* would be misread as a comment.
    # Hasn't happened in this codebase. If it does, the fix is to track the prev
    # significant token to tell division from a regex, which is ~20 lines.
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c in "'\"":
            q = c
            i += 1
            while i < n and text[i] != q:
                i += 2 if text[i] == "\\" else 1
            i += 1
        elif c == "`":
            i += 1
            depth = 0
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == "$" and text[i + 1:i + 2] == "{":
                    depth += 1
                    i += 2
                    continue
                if depth and text[i] == "}":
                    depth -= 1
                elif not depth and text[i] == "`":
                    break
                i += 1
            i += 1
        elif c == "/" and text[i + 1:i + 2] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
            spans.append((i + 2, j))
            i = j
        elif c == "/" and text[i + 1:i + 2] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j
            spans.append((i + 2, j))
            i = j + 2
        else:
            i += 1
    return spans


FENCE = re.compile(r"^(```|~~~).*?^\1", re.S | re.M)
INLINE = re.compile(r"`[^`\n]*`")


def mdSpans(text):
    """Everything in a markdown file except fenced blocks and inline code."""
    blocked = sorted(m.span() for m in
                     list(FENCE.finditer(text)) + list(INLINE.finditer(text)))
    spans, at = [], 0
    for a, b in blocked:
        if a > at:
            spans.append((at, a))
        at = max(at, b)
    if at < len(text):
        spans.append((at, len(text)))
    return spans


# --- transforms ------------------------------------------------------------

# "wherever you are," and "that's just how it is." both end a clause, and a contraction
# cannot carry the stress there. Never contract a "be" verb sitting before punctuation.
END = r"(?!\s*[.,;:!?)\]]|\s*$)"

CONTRACTIONS = [
    (r"\b([Ii])t is\b" + END, r"\1t's"),
    (r"\b([Tt])hat is\b" + END, r"\1hat's"),
    (r"\b([Tt])here is\b" + END, r"\1here's"),
    (r"\b([Ww])hat is\b" + END, r"\1hat's"),
    (r"\b([Ww])ho is\b" + END, r"\1ho's"),
    (r"\b([Ll])et us\b", r"\1et's"),
    (r"\b([Ii])t will\b", r"\1t'll"),
    (r"\b([Tt])hat will\b", r"\1hat'll"),
    (r"\b([Tt])here will\b", r"\1here'll"),
    (r"\b([Yy])ou will\b", r"\1ou'll"),
    (r"\b([Ww])e will\b", r"\1e'll"),
    (r"\b([Tt])hey will\b", r"\1hey'll"),
    (r"\b([Ii])t would\b", r"\1t'd"),
    (r"\b([Yy])ou would\b", r"\1ou'd"),
    (r"\b([Ww])e would\b", r"\1e'd"),
    (r"\b([Tt])hey would\b", r"\1hey'd"),
    (r"\b([Yy])ou are\b" + END, r"\1ou're"),
    (r"\b([Ww])e are\b" + END, r"\1e're"),
    (r"\b([Tt])hey are\b" + END, r"\1hey're"),
    (r"\b([Yy])ou have\b", r"\1ou've"),
    (r"\b([Ww])e have\b", r"\1e've"),
    (r"\b([Tt])hey have\b", r"\1hey've"),
    (r"\b([Ii])s not\b", r"\1sn't"),
    (r"\b([Aa])re not\b", r"\1ren't"),
    (r"\b([Ww])as not\b", r"\1asn't"),
    (r"\b([Ww])ere not\b", r"\1eren't"),
    (r"\b([Hh])as not\b", r"\1asn't"),
    (r"\b([Hh])ave not\b", r"\1aven't"),
    (r"\b([Hh])ad not\b", r"\1adn't"),
    (r"\b([Dd])oes not\b", r"\1oesn't"),
    (r"\b([Dd])o not\b", r"\1on't"),
    (r"\b([Dd])id not\b", r"\1idn't"),
    (r"\b([Cc])annot\b", r"\1an't"),
    (r"\b([Ww])ill not\b", r"\1on't"),
    (r"\b([Ww])ould not\b", r"\1ouldn't"),
    (r"\b([Ss])hould not\b", r"\1houldn't"),
    (r"\b([Cc])ould not\b", r"\1ouldn't"),
]
CONTRACTIONS = [(re.compile(p), r) for p, r in CONTRACTIONS]

# Only words that carry nothing. Degree words are not here on purpose: "slightly faster",
# "just the one" and "effectively a no-op" all lose a fact if the word goes.
FILLER = (
    "legitimately genuinely honestly actually really truly simply basically "
    "essentially literally arguably notably clearly obviously certainly definitely "
    "fundamentally ultimately"
).split()
# Capture the next word so a removal at a sentence start can re-capitalize it.
FILLER_RE = re.compile(r"\b(%s)\b(\s+)(\w)" % "|".join(
    w.capitalize() + "|" + w for w in FILLER))

# Both sides must be a word, so a leading "— aside" or a "5 — 9" range is left alone.
EM_DASH_RE = re.compile(r"(?<=\w)\s*—\s*(?=\w)")
SMART = {"‘": "'", "’": "'", "“": '"', "”": '"', "…": "..."}


def dropFiller(m):
    head, nxt = m.group(1), m.group(3)
    return nxt.upper() if head[0].isupper() else nxt


def transform(s):
    for pat, rep in CONTRACTIONS:
        s = pat.sub(rep, s)
    s = FILLER_RE.sub(dropFiller, s)
    s = EM_DASH_RE.sub("; ", s)
    for a, b in SMART.items():
        s = s.replace(a, b)
    return s


def rewrite(text, spans):
    out, at = [], 0
    for a, b in spans:
        out.append(text[at:a])
        out.append(transform(text[a:b]))
        at = b
    out.append(text[at:])
    return "".join(out)


def spansFor(path, text):
    return mdSpans(text) if path.suffix == ".md" else codeSpans(text)


# --- driver ----------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write files (default: print a diff)")
    ap.add_argument("--selftest", action="store_true")
    opt = ap.parse_args(argv)
    if opt.selftest:
        return selftest()

    changed = 0
    for p in files():
        text = p.read_text(encoding="utf-8")
        new = rewrite(text, spansFor(p, text))
        if new == text:
            continue
        changed += 1
        rel = p.relative_to(ROOT).as_posix()
        if opt.apply:
            p.write_text(new, encoding="utf-8", newline="")
            print(rel)
        else:
            sys.stdout.writelines(difflib.unified_diff(
                text.splitlines(True), new.splitlines(True), rel, rel, n=0))
    print(f"\n{changed} file(s) {'written' if opt.apply else 'would change'}", file=sys.stderr)
    return 0


def selftest():
    def r(t):
        return rewrite(t, codeSpans(t))

    # the failure that broke the tree once: prose inside a string literal
    assert r("const s = 'that is fine'\n// that is fine\n") == \
        "const s = 'that is fine'\n// that's fine\n"
    assert "`it is ${x} it is`" in r("`it is ${x} it is` // it is here\n")
    assert r("/* they are late */ let a = 1 / 2 / 3\n") == "/* they're late */ let a = 1 / 2 / 3\n"

    # a "be" verb closing a clause keeps its full form
    for t in ("// it is.\n", "// wherever you are, stop\n", "// however odd that is)\n"):
        assert r(t) == t, t

    # contractions run before filler, so "It is really" lands as "It's"
    assert r("// Simply drop it. It is really fine.\n") == "// Drop it. It's fine.\n"
    assert r("// a row rather than code, slightly faster, just the one\n") == \
        "// a row rather than code, slightly faster, just the one\n"
    assert r("// Clause a — clause b.\n") == "// Clause a; clause b.\n"

    md = "prose that is here\n```\ncode that is here\n```\n`that is`\n"
    out = rewrite(md, mdSpans(md))
    assert "prose that's here" in out and "code that is here" in out and "`that is`" in out

    # idempotent: a second pass is a no-op on every case above
    for t in ("// that is fine. It is really odd — see above.\n", md):
        once = rewrite(t, spansFor(Path("x.ts"), t))
        assert rewrite(once, spansFor(Path("x.ts"), once)) == once

    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
