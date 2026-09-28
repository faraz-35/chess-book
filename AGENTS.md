# chess-book

An interactive chess book: sections of *What It Takes to Become a Chess
Master* (Andrew Soltis, Batsford 2012) as an original, board- beside-text
reader, produced by a data pipeline that runs on opencode + glm-5.3-flash.

## Layout

- `syllabus/book.json` — the source of truth. Chapters of the book, and for
  each section we want: its goal, key ideas, exercise mix. Only sections that
  exist here can be generated.
- `data/source/games.pgn` — verified seed games the generator may copy moves
  from. Never invent historical games; add real ones here instead.
- `prompts/` — the draft and repair prompts (templates, `{{VARS}}` filled by
  the generator).
- `pipeline/` — queue, generator, validator (all plain Node ESM + chess.js).
- `content/` — generated section JSON + `index.json` manifest (derived, do
  not hand-edit).
- `reader/` — the static reader (no build step, no framework).

## Commands

    npm run read                     # reader on http://localhost:8878/
    npm run queue -- list            # what exists / what is pending
    npm run validate -- --all        # replay every section + seed games
    npm run generate                 # next pending section, end to end
    npm run generate -- 1.3          # one specific section
    npm run generate -- 1.3 --dry    # print the prompt, don't call the model

## Rules

- One section = one model turn. Sections in the syllabus are small on
  purpose (5–8 steps); keep new specs in that range.
- The pipeline decides all chess content (moves, positions, quiz solutions),
  verifies it with chess.js, and hands it to the model as a fixed skeleton
  (`fixedSteps` in the spec). The model writes prose only. Never ask the
  model to design or verify chess: glm-5.3-flash will simulate the whole
  section in its head (evidence: 32k-token reasoning monologues,
  finish="length" cutoffs) and never ship.
- Prompts stay minimal (`prompts/`). Do not add rules, quality bars or
  multi-pass schemes without strong evidence they help.
- The validator is the only ground truth and it is cheap. The model gets at
  most one repair pass; if it still fails, the section fails loudly and is
  deleted. Do not grow the repair loop.
- Prose may reference moves as `<m SAN>plain words</m>`; the reader clicks
  them to see the move played. The validator checks every wrapped move is
  legal in the position where the reader sees it.
- Never hand-edit `content/<id>.json` without re-running
  `npm run validate -- content/<id>.json`.
- Never quote Soltis's text. Sections are original treatments of his ideas.
- `content/index.json` is derived — rebuilt by the generator after each run
  (`npm run queue -- reindex` rebuilds it by hand).
- Model is `zai-coding-plan/glm-5.3-flash` (opencode auth = zai-coding-plan).
- Content is JSON, the reader renders it. Do not generate HTML per section:
  every section would have to re-emit the board/quiz/scroll JavaScript
  (huge output, unverifiable). The JSON is small and machine-checkable.
- Progress is logged to `PROGRESS.log`, one timestamped line per action.
