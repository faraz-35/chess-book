// One section per run. The model writes content/<id>.json with its file
// tools; the validator replays every move locally (cheap, no model); if
// validation fails the model gets ONE repair pass with the error list.
// Nothing is committed unless the section is green.
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
const TIMEOUT_MS = 25 * 60 * 1000;
const MAX_REPAIRS = 1;

// ---------- args ----------

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const targetId = argv.find((a) => !a.startsWith("--"));

// ---------- prompt ----------

function promptFor(template, id, chapter, section, errors) {
  const vars = {
    CHAPTER_ID: chapter.id,
    CHAPTER_TITLE: chapter.title,
    SECTION_ID: section.id,
    SECTION_TITLE: section.title,
    OUTFILE: `content/${id}.json`,
    GOAL: [section.spec.goal, ...(section.spec.keyIdeas ?? []).map((i) => `- ${i}`)].join("\n"),
    SKELETON: JSON.stringify(section.spec.fixedSteps ?? null, null, 2),
    ERRORS: (errors ?? []).map((e) => `- ${e.path}: ${e.message}`).join("\n"),
  };
  let out = fs.readFileSync(path.join(ROOT, "prompts", template), "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

// ---------- model ----------

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
      let tokens = null;
      for (const line of stdout.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event.type === "text" && event.part?.text) texts.push(event.part.text);
          if (event.type === "step_finish" && event.part?.tokens) tokens = event.part.tokens;
        } catch { /* heartbeat lines are not json */ }
      }
      const text = texts.join("\n");
      if (signal) return resolve({ ok: false, text, tokens, reason: `killed by ${signal} after ${fmtDur(Date.now() - started)}` });
      resolve({ ok: code === 0, text, tokens, reason: code === 0 ? null : `opencode exited ${code}` });
    });
  });
}

const fmtDur = (ms) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

// ---------- judge ----------

// read what the model wrote, canonicalize, replay it. returns error list.
function judge(id, outfile) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(outfile, "utf-8"));
  } catch (e) {
    return [{ path: `content/${id}.json`, message: `missing or unparsable: ${e.message}` }];
  }
  const errors = validateSection(doc);
  if (errors.length === 0) {
    fs.writeFileSync(outfile, JSON.stringify(doc, null, 2) + "\n");
  }
  return errors;
}

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
    console.log(promptFor("section.md", id, chapter, section));
    console.log("\n========================= repair prompt =========================\n");
    console.log(promptFor("repair.md", id, chapter, section, [{ path: "steps[2].moves[0]", message: "\"Qxb7\" is illegal here" }]));
    return;
  }

  console.log(`section ${id} — ${section.title}   (model: ${MODEL})`);
  start(id);
  log(`generate ${id} started (${section.title})`);

  let errors = [];
  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const label = attempt === 0 ? "write" : "repair";
    const prompt = attempt === 0
      ? promptFor("section.md", id, chapter, section)
      : promptFor("repair.md", id, chapter, section, errors);
    console.log(`${label}: calling ${MODEL} …`);
    const run = await runOpencode(prompt);
    if (run.tokens) console.log(`${label}: ${run.tokens.output ?? "?"} output tokens`);
    if (!run.ok) {
      errors = [{ path: "model", message: run.reason }];
      console.log(`${label}: ${run.reason}`);
      break;
    }
    errors = judge(id, outfile);
    console.log(`${label}: ${errors.length === 0 ? "valid" : `${errors.length} validation error(s)`}`);
    for (const e of errors) console.log(`  · ${e.path}: ${e.message}`);
    if (errors.length === 0) {
      const doc = JSON.parse(fs.readFileSync(outfile, "utf-8"));
      const { steps, quizzes } = counts(doc);
      buildIndex();
      done(id, `${steps} steps · ${quizzes} quizzes`);
      commit(id, section.title);
      log(`generate ${id} OK — ${steps} steps, ${quizzes} quizzes, ${attempt === 0 ? "no repair" : "1 repair"}`);
      console.log(`\nshipped content/${id}.json — ${steps} steps, ${quizzes} quizzes. Open http://localhost:8878/reader/section.html?s=${id}`);
      return;
    }
  }

  const reason = errors.map((e) => `${e.path}: ${e.message}`).join("; ").slice(0, 200);
  fail(id, reason);
  fs.rmSync(outfile, { force: true }); // never leave a broken draft to block the next run
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
    console.log("git commit skipped");
  }
}

main();
