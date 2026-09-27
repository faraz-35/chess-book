You are writing one section of an interactive chess book. A board sits beside
scrolling text; the reader reads, watches the board play, and solves positions
by moving the pieces. You produce ONE JSON document. Your entire reply becomes
a file on disk, checked by a validator that replays every move.

## Output contract

- Reply with ONLY the JSON document. No markdown fences, no prose before or
  after, no explanation. Start your reply with `{` and end it with `}`.
- Every move must be legal. Before you write a step with moves or a quiz,
  replay the line in your head, square by square: where does each piece stand?
- Do not invent historical games. Use the seed games below when one fits;
  otherwise present positions as constructed teaching positions.

## Document format

Top level:

    {
      "book": "What It Takes to Become a Chess Master",
      "author": "Andrew Soltis",
      "chapter": "Chapter {{CHAPTER_ID}} · {{CHAPTER_TITLE}}",
      "section": "{{SECTION_ID}} — {{SECTION_TITLE}}",
      "baseFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "sections": [ { "title": "…", "steps": [ … ] } ]
    }

The board flows through the whole section like one game: a step's position is
its own `fen` if present, otherwise the previous step's position after its
moves. Steps:

- `title` — required, short.
- `text` — required, the reading. Plain text, paragraphs separated by one
  blank line. `<b>…</b>` is the only allowed markup.
- `fen` — optional, only when the board must jump somewhere new.
- `moves` — optional array of SAN moves the board plays when the step opens,
  e.g. `["Nxd5"]`.
- `arrows` — optional `[[from,to],…]`, e.g. `[["c4","f7"]]`.
- `circles`, `highlight` — optional arrays of squares.
- `quiz` — `{ "solution": "SAN", "hint": "…", "praise": "…" }`. The reader
  must find and play the solution on the board. `hint` nudges without giving
  the move away. `praise` is what the reader sees after solving: name the
  pattern, explain why the move works, in 1–3 short paragraphs (HTML `<b>` ok).
- `flash` — `{ "seconds": 8, "questions": [ { "q": "…", "options": ["…","…","…"], "answer": 1 } ] }`.
  Shows a position for N seconds, hides it, asks the questions from memory.
  3 questions, `answer` is the index of the correct option.

## Content rules

- The reader is a serious club player (about 1400–1800) who wants to become a
  master. Respect their time: no filler, no repetition of earlier sections.
- The section teaches the ideas in the SPEC below. That spec is the source of
  truth. The book by Andrew Soltis is the inspiration — never quote it, never
  invent quotes from Soltis, write fully original prose.
- Prose style: short sentences. Everyday words. Speak directly to the reader
  ("you"). Say exactly what happens on the board and what the reader should
  do. No marketing tone, no riddles, no cleverness.
- Quiz quality is the product. Each quiz needs ONE clearly best move, a hint
  that teaches a habit, and praise that names the pattern the reader just used.
- Seed games (verified, replay them move by move if you use one):
{{GAMES}}

## This section's spec

{{SPEC}}

## Shape of a good section

- 3–4 subsections in `sections`, 8–14 steps total.
- 3–4 quiz steps spread through the section. At most 1 flash step.
- Open by pulling the reader into the section's question with a concrete board
  situation. Close with a numbered takeaway list inside the last step's text,
  then one line pointing at what the section after this one is about.
- Vary the rhythm: read → watch → solve. Never more than 3 read-only steps in
  a row.
