# chess-book

An interactive chess book. You read; a live board sits beside the text and
follows you. Where the book asks you to find a move, you play it on the
board. Everywhere else the board is yours — move pieces around freely.

Built on Andrew Soltis's *What It Takes to Become a Chess Master*
(Batsford 2012). All explanations are original — the book's ideas, not its
text. Every position, move line and puzzle solution is verified by replaying
it in chess.js before it ships.

## Read

    npm install
    npm run read          # → http://localhost:8878/

- The contents page lists what exists (today: chapter 1).
- Scroll to read. The board plays each step as you reach it.
- `←` / `→` jump between steps.
- In a puzzle, click a piece, then its square. "show the move" appears if
  you want it. Anywhere else, the board is free play — a "reset the board"
  link appears the moment you move something.

## Generate

Content is produced by a resumable pipeline (the same shape as Parhako's):

    syllabus/book.json  →  opencode (glm-5.3-flash) draft  →  validator
                            ↑ repair loop (validation errors go back)  ←

    npm run generate -- 1.2

One command takes a section end to end: draft, validation replay, up to two
repair rounds, manifest rebuild, git commit. Nothing is committed unless
every move replays legally.

- `npm run queue -- list` — what's done, what's pending
- `npm run validate -- --all` — ground truth for everything
- `npm run generate -- 1.3 --dry` — inspect the prompt without calling the model

## Structure

    syllabus/   book.json — chapters, section specs (source of truth)
    data/       queue.json (derived) · source/games.pgn (verified seed games)
    prompts/    draft + repair prompt templates
    pipeline/   queue.mjs · generate.mjs · validate.mjs · log.mjs
    content/    <id>.json sections + index.json manifest (derived)
    reader/     static reader — no framework, no build step
