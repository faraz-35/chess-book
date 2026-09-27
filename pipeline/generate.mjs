// One section, end to end: opencode (glm-5.3-flash) drafts the JSON → the
// validator replays every move → a repair loop fixes what fails → index,
// queue and git updated. Resumable by nature: nothing is committed unless
// the section is green.
//
//   npm run generate                # next pending section from the queue
//   npm run generate -- 1.2         # one specific section
//   npm run generate -- 1.2 --dry   # print the prompt, don't call the model

import { spawn, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateSection } from "./validate.mjs";
import { start, done, fail, nextPending, findSpec, buildIndex, recordAttempt, populate } from "./queue.mjs";
import { log } from "./log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "zai-coding-plan/glm-5.3-flash";
const TIMEOUT_MS = 15 * 60 * 1000;
const MAX_REPAIRS = 2;

// ---------- args ----------

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const targetId = argv.find((a) => !a.startsWith("--"));
const dry = flags.includes("--dry");

// ---------- prompts ----------

const specOf = (spec) => JSON.stringify(spec, null, 2);

function gamesDigest() {
  const raw = fs.readFileSync(path.join(ROOT, "data/source/games.pgn"), "utf-8");
  const start = raw.indexOf("[Event");
  return start === -1 ? raw : raw.slice(start);
}

function render(template, vars) {
  let out = fs.readFileSync(path.join(ROOT, "prompts", template), "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function promptFor(id, chapter, section, errors) {
  const vars = {
    CHAPTER_ID: chapter.id,
    CHAPTER_TITLE: chapter.title,
    SECTION_ID: section.id,
    SECTION_TITLE: section.title,
    SPEC: specOf(section.spec),
    GAMES: gamesDigest(),
    ERRORS: (errors ?? []).map((e) => `- ${e.path}: ${e.message}`).join("\n"),
  };
  return render(errors ? "repair.md" : "section.md", vars);
}

// ---------- model ----------

function extractJson(text) {
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from === -1 || to <= from) return null;
  try {
    return JSON.parse(text.slice(from, to + 1));
  } catch {
    return null;
  }
}

function runOpencode(prompt) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(
      "opencode",
      ["run", "-m", MODEL, "--dangerously-skip-permissions", "--format", "json", prompt],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: TIMEOUT_MS },
    );
    const heartbeat = setInterval(() => {
      const s = Math.round((Date.now() - started) / 1000);
      console.log(`  … model still working (${Math.floor(s / 60)}m ${s % 60}s)`);
    }, 30_000);

    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", (err) => {
      clearInterval(heartbeat);
      resolve({ ok: false, text: "", reason: `could not run opencode: ${err.message}` });
    });
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      const texts = [];
      for (const line of stdout.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event.type === "text" && event.part?.text) texts.push(event.part.text);
        } catch { /* heartbeat lines are not json */ }
      }
      if (signal) return resolve({ ok: false, text: texts.join("\n"), reason: `killed by ${signal} after ${fmtDur(Date.now() - started)}` });
      resolve({ ok: code === 0, text: texts.join("\n"), reason: code === 0 ? null : `opencode exited ${code}` });
    });
  });
}

const fmtDur = (ms) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

// ---------- counts ----------

const counts = (doc) => {
  const steps = (doc.sections ?? []).reduce((n, s) => n + (s.steps?.length ?? 0), 0);
  const quizzes = (doc.sections ?? []).reduce((n, s) => n + (s.steps ?? []).filter((t) => t.quiz).length, 0);
  return { steps, quizzes };
};

// ---------- main ----------

async function main() {
  populate();
  const id = targetId ?? nextPending()?.id;
  if (!id) {
    console.error("queue has no pending section — nothing in the syllabus is missing a file");
    process.exit(1);
  }
  const found = findSpec(id);
  if (!found) {
    console.error(`"${id}" is not in syllabus/book.json — the syllabus is the source of truth`);
    process.exit(1);
  }
  const { chapter, section } = found;
  const outfile = path.join(ROOT, `content/${id}.json`);
  if (fs.existsSync(outfile)) {
    console.error(`content/${id}.json already exists — delete it first if you want it regenerated`);
    process.exit(1);
  }

  if (dry) {
    console.log(promptFor(id, chapter, section, null));
    return;
  }

  console.log(`section ${id} — ${section.title}   (model: ${MODEL})`);
  start(id);
  log(`generate ${id} started (${section.title})`);

  let errors = null;
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const label = attempt === 0 ? "draft" : `repair ${attempt}/${MAX_REPAIRS}`;
    const prompt = promptFor(id, chapter, section, errors);
    if (dry) {
      console.log("--- prompt ----------------------------------------------");
      console.log(prompt);
      return;
    }
    console.log(`${label}: calling ${MODEL} …`);
    const run = await runOpencode(prompt);
    if (!run.ok && !run.text) {
      errors = [{ path: "model", message: run.reason }];
      console.log(`${label}: ${run.reason}`);
      break;
    }
    const doc = extractJson(run.text);
    if (!doc) {
      errors = [{ path: "reply", message: "the reply contained no parsable JSON document" }];
      console.log(`${label}: no parsable JSON in reply`);
    } else {
      fs.writeFileSync(outfile, JSON.stringify(doc, null, 2) + "\n");
      errors = validateSection(doc);
      console.log(`${label}: ${errors.length === 0 ? "valid" : `${errors.length} validation error(s)`}`);
      if (errors.length) for (const e of errors) console.log(`  · ${e.path}: ${e.message}`);
    }
    if (errors.length === 0) {
      const { steps, quizzes } = counts(doc);
      buildIndex();
      done(id, `${steps} steps · ${quizzes} quizzes · ${MODEL.split("/")[1]}`);
      commit(id, section.title);
      log(`generate ${id} OK — ${steps} steps, ${quizzes} quizzes, ${attempt === 0 ? "first draft" : attempt + " repair(s)"}`);
      console.log(`\nshipped content/${id}.json — ${steps} steps, ${quizzes} quizzes. Open http://localhost:8878/reader/section.html?s=${id}`);
      return;
    }
    if (attempt < MAX_REPAIRS) console.log(`repairing with ${errors.length} error(s) in the prompt …`);
  }

  const reason = errors.map((e) => `${e.path}: ${e.message}`).join("; ").slice(0, 200);
  fail(id, reason);
  log(`generate ${id} FAILED — ${reason}`);
  console.error(`\ngiving up on ${id}: ${reason}`);
  process.exit(1);
}

function commit(id, title) {
  try {
    execFileSync("git", ["add", `content/${id}.json`, "content/index.json", "data/queue.json", "PROGRESS.log"], { cwd: ROOT });
    execFileSync("git", ["commit", "-m", `content(${id}): ${title}`], { cwd: ROOT, stdio: "pipe" });
    console.log(`committed: content/${id}.json`);
  } catch {
    console.log("git commit skipped (not a repo or nothing to commit)");
  }
}

main();
