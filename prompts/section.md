Turn the step skeleton below into a finished interactive chess section.
Write the JSON to the file `{{OUTFILE}}`, then reply with just `done`.

All chess content — moves, arrows, quiz solutions — is decided and already
verified by the pipeline. Copy it EXACTLY. Invent nothing on the board. Your
job is only the words: titles, texts, hints, praise.

## What it teaches

{{GOAL}}

## Step skeleton (copy the chess fields exactly, in this order)

{{SKELETON}}

## Output format

    {
      "book": "What It Takes to Become a Chess Master",
      "author": "Andrew Soltis",
      "chapter": "Chapter {{CHAPTER_ID}} · {{CHAPTER_TITLE}}",
      "section": "{{SECTION_ID}} — {{SECTION_TITLE}}",
      "baseFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "sections": [
        { "title": "subsection title", "steps": [
          { "title": "step title",
            "moves": ["…", "…"],
            "quiz": { "solution": "…", "hint": "…", "praise": "…" },
            "text": "…" }
        ] }
      ]
    }

- Group the skeleton steps into 2–3 subsections with good titles; keep the
  steps themselves in the given order, with their moves/arrows/quiz fields
  exactly as given.
- A skeleton step with "arrows" becomes a step with those arrows plus its
  text (no moves). A "takeaways" step is a plain text step: a numbered
  takeaway list, then one line on what the next section is about
  (finding and improving your worst piece).
- `text`: 2–4 short sentences per step, using the skeleton's `point`.
- `hint`: one sentence that nudges without naming the move.
- `praise`: 1–2 short paragraphs — name the pattern, say why the move worked.
- Reader: club player (~1400–1800). Plain words, short sentences, direct
  address ("you"). Original prose, never quote Soltis.
- Do NOT replay or verify any chess in your head. Do not add, remove, or
  change moves. The validator checks the file; if it flags something you
  get one short fix pass.
