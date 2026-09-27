// Ground truth for everything the pipeline produces or seeds.
//   node pipeline/validate.mjs content/1.2.json      validate one section
//   node pipeline/validate.mjs --all                 validate every content/*.json
//   node pipeline/validate.mjs data/source/games.pgn replay seed games
//   node pipeline/validate.mjs --all --json          errors as JSON (for the repair loop)
//
// Exit 0 = clean. Exit 1 = at least one failure.

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const { Chess } = require("chess.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = path.join(ROOT, "content");

const SQUARE = /^[a-h][1-8]$/;

class Errors {
  constructor() { this.list = []; }
  add(path, message) { this.list.push({ path, message }); }
  get ok() { return this.list.length === 0; }
}

const err = (errors, path, message) => errors.add(path, message);

const isSquare = (sq) => typeof sq === "string" && SQUARE.test(sq);

function checkFen(fen, path, errors) {
  if (typeof fen !== "string" || !fen.trim()) {
    err(errors, path, "missing fen");
    return false;
  }
  try {
    new Chess(fen);
    return true;
  } catch (e) {
    err(errors, path, `invalid fen "${fen}": ${e.message}`);
    return false;
  }
}

// A step's board position = its own fen (jump) or the carried position after
// its scripted moves. Returns the game as it stands AFTER the step's moves.
function replayStep(step, i, carried, errors) {
  const p = `steps[${i}]`;
  if (!step || typeof step !== "object") {
    err(errors, p, "step is not an object");
    return null;
  }
  if (typeof step.title !== "string" || !step.title.trim()) err(errors, `${p}.title`, "missing or empty");
  if (typeof step.text !== "string" || !step.text.trim()) err(errors, `${p}.text`, "missing or empty");

  let game;
  const hasFen = step.fen !== undefined;
  if (hasFen) {
    if (!checkFen(step.fen, `${p}.fen`, errors)) return null;
    game = new Chess(step.fen);
  } else if (carried) {
    game = carried;
  } else {
    err(errors, `${p}.fen`, "no fen and no carried position (check the previous step)");
    return null;
  }

  const moves = step.moves ?? [];
  if (!Array.isArray(moves)) err(errors, `${p}.moves`, "must be an array");
  for (const [j, san] of Array.isArray(moves) ? moves.entries() : []) {
    try {
      game.move(san);
    } catch {
      const legal = game.moves().slice(0, 10).join(", ");
      err(errors, `${p}.moves[${j}]`, `"${san}" is illegal here. Legal moves include: ${legal}`);
      return game;
    }
  }

  checkShapes(step, p, errors);
  checkQuiz(step, p, game, errors);
  checkFlash(step, p, errors);
  return game;
}

function checkShapes(step, p, errors) {
  const arrows = step.arrows ?? [];
  if (!Array.isArray(arrows)) return err(errors, `${p}.arrows`, "must be an array");
  arrows.forEach(([from, to], j) => {
    if (!isSquare(from) || !isSquare(to)) err(errors, `${p}.arrows[${j}]`, `"${from}->${to}" is not a pair of squares`);
  });
  for (const key of ["circles", "highlight"]) {
    const list = step[key] ?? [];
    if (!Array.isArray(list)) return err(errors, `${p}.${key}`, "must be an array");
    list.forEach((sq, j) => {
      if (!isSquare(sq)) err(errors, `${p}.${key}[${j}]`, `"${sq}" is not a square`);
    });
  }
}

function checkQuiz(step, p, game, errors) {
  if (!step.quiz) return;
  const q = step.quiz;
  const qp = `${p}.quiz`;
  if (typeof q.solution !== "string" || !q.solution.trim()) return err(errors, `${qp}.solution`, "missing or empty");
  if (typeof q.hint !== "string" || !q.hint.trim()) err(errors, `${qp}.hint`, "missing or empty — every puzzle teaches through its hint");
  if (typeof q.praise !== "string" || !q.praise.trim()) err(errors, `${qp}.praise`, "missing or empty — every puzzle explains itself after solving");
  if (!game) return;
  try {
    game.move(q.solution);
  } catch {
    const legal = game.moves().slice(0, 10).join(", ");
    err(errors, `${qp}.solution`, `"${q.solution}" is not legal in the quiz position. Legal moves include: ${legal}`);
  }
}

function checkFlash(step, p, errors) {
  if (!step.flash) return;
  const f = step.flash;
  const fp = `${p}.flash`;
  if (!Number.isInteger(f.seconds) || f.seconds < 3 || f.seconds > 60) err(errors, `${fp}.seconds`, `must be an integer 3–60, got ${JSON.stringify(f.seconds)}`);
  if (!Array.isArray(f.questions) || f.questions.length < 2) return err(errors, `${fp}.questions`, "need at least 2 questions");
  f.questions.forEach((q, j) => {
    const qp = `${fp}.questions[${j}]`;
    if (typeof q.q !== "string" || !q.q.trim()) err(errors, `${qp}.q`, "missing or empty");
    if (!Array.isArray(q.options) || q.options.length < 3) { err(errors, `${qp}.options`, "need at least 3 options"); return; }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      err(errors, `${qp}.answer`, `${JSON.stringify(q.answer)} is out of range for ${q.options.length} options`);
    }
  });
}

export function validateSection(doc) {
  const errors = new Errors();
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    errors.add("document", "not a JSON object");
    return errors.list;
  }
  for (const key of ["book", "author", "chapter", "section", "baseFen"]) {
    if (typeof doc[key] !== "string" || !doc[key].trim()) err(errors, key, "missing or empty");
  }
  if (!doc.baseFen || !checkFen(doc.baseFen, "baseFen", errors)) return errors.list;

  if (!Array.isArray(doc.sections) || doc.sections.length < 2) {
    err(errors, "sections", "need at least 2 subsections (an opening and a closing)");
  }

  // The board flows across subsections: a step continues the previous step's
  // position after its moves, unless it carries its own fen (a jump).
  let carried = new Chess(doc.baseFen);
  let quizzes = 0;
  let stepsTotal = 0;
  (doc.sections ?? []).forEach((sec, si) => {
    const sp = `sections[${si}]`;
    if (typeof sec?.title !== "string" || !sec.title.trim()) err(errors, `${sp}.title`, "missing or empty");
    if (!Array.isArray(sec.steps) || sec.steps.length === 0) {
      err(errors, `${sp}.steps`, "missing or empty");
      return;
    }
    sec.steps.forEach((step, ti) => {
      const game = replayStep(step, `${sp}.steps[${ti}]`, carried, errors);
      if (game) carried = game;
      if (step?.quiz) quizzes++;
      stepsTotal++;
    });
  });

  if (stepsTotal < 5 || stepsTotal > 24) err(errors, "steps", `${stepsTotal} steps — a section is 5–24 steps`);
  if (quizzes < 2) err(errors, "quiz", `only ${quizzes} quiz steps — a section needs at least 2 board puzzles`);
  if (quizzes > 6) err(errors, "quiz", `${quizzes} quiz steps is too many — cap at 6`);

  return errors.list;
}

// ---------- PGN seeds ----------

function replayPgn(text, file, errors) {
  const games = text.split(/\n\s*\n/).filter((b) => b.includes("[Event"));
  for (const [gi, block] of games.entries()) {
    const p = `${file}#games[${gi}]`;
    const fenLine = block.match(/\[FEN "([^"]+)"\]/);
    const header = (block.match(/\[Event "([^"]+)"\]/) || [])[1] || `game ${gi}`;
    let game;
    try {
      game = new Chess(fenLine ? fenLine[1] : undefined);
    } catch (e) {
      err(errors, p, `bad start fen: ${e.message}`);
      continue;
    }
    const movetext = block
      .replace(/\{[^}]*\}/g, " ")   // comments
      .replace(/^\s*;.*$/gm, " ")
      .replace(/\[[^\]]*\]/g, " ")  // headers
      .replace(/\d+\.{1,3}/g, " ")  // move numbers, incl. "5..."
      .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, " ");
    const sans = movetext.split(/\s+/).filter(Boolean);
    for (const [mi, san] of sans.entries()) {
      try {
        game.move(san);
      } catch {
        const prefix = sans.slice(Math.max(0, mi - 3), mi).join(" ");
        err(errors, p, `"${san}" illegal after "${prefix}" in "${header}"`);
        break;
      }
    }
  }
}

// ---------- CLI ----------

export function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const targets = args.filter((a) => a !== "--all" && a !== "--json");

  const files = args.includes("--all")
    ? fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").sort().map((f) => path.join(CONTENT_DIR, f))
    : targets.map((t) => (t.endsWith(".pgn") ? path.join(ROOT, t) : path.resolve(ROOT, t)));

  if (files.length === 0) {
    console.error("nothing to validate — pass a file, a .pgn, or --all");
    process.exit(1);
  }

  let failed = false;
  const allErrors = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (!fs.existsSync(file)) {
      failed = true;
      allErrors.push({ file: rel, path: "-", message: "file not found" });
      console.log(` FAIL  ${rel} — file not found`);
      continue;
    }
    if (file.endsWith(".pgn")) {
      const errors = new Errors();
      replayPgn(fs.readFileSync(file, "utf-8"), rel, errors);
      report(rel, errors.list, asJson);
      if (errors.list.length) failed = true;
      allErrors.push(...errors.list.map((e) => ({ file: rel, ...e })));
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (e) {
      failed = true;
      allErrors.push({ file: rel, path: "JSON", message: e.message });
      console.log(` FAIL  ${rel} — JSON does not parse: ${e.message}`);
      continue;
    }
    const errors = validateSection(doc);
    report(rel, errors, asJson);
    if (errors.length) failed = true;
    allErrors.push(...errors.map((e) => ({ file: rel, ...e })));
  }

  if (asJson) console.log(JSON.stringify(allErrors, null, 2));
  process.exit(failed ? 1 : 0);
}

function report(file, errors, asJson) {
  if (asJson) return;
  const steps = errors.length;
  if (steps === 0) {
    console.log(`  ok   ${file}`);
    return;
  }
  for (const e of errors) console.log(` FAIL  ${file} · ${e.path}: ${e.message}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
