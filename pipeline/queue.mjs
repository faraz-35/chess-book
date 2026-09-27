// The content queue: which sections exist, which are generated, which is next.
//
//   node pipeline/queue.mjs populate            build entries from the syllabus
//   node pipeline/queue.mjs list                show the queue
//   node pipeline/queue.mjs next                print the next pending section id
//   node pipeline/queue.mjs start <id>          mark in_progress
//   node pipeline/queue.mjs done <id> [note]    mark done
//   node pipeline/queue.mjs fail <id> [note]    mark failed
//   node pipeline/queue.mjs reset <id>          back to pending
//   node pipeline/queue.mjs reindex             rebuild content/index.json
//
// generate.mjs imports this as a library.

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATH = path.join(ROOT, "data/queue.json");
const SYLLABUS_PATH = path.join(ROOT, "syllabus/book.json");
const CONTENT_DIR = path.join(ROOT, "content");
const INDEX_PATH = path.join(CONTENT_DIR, "index.json");

// ---------- queue file ----------

export function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, "utf-8"));
  } catch {
    return { entries: [] };
  }
}

function saveQueue(queue) {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");
}

function findEntry(queue, id) {
  const entry = queue.entries.find((e) => e.id === id);
  if (!entry) {
    console.error(`no queue entry "${id}" — run: npm run queue -- populate`);
    process.exit(1);
  }
  return entry;
}

function setStatus(id, status, note) {
  const queue = loadQueue();
  const entry = findEntry(queue, id);
  entry.status = status;
  entry.updated = new Date().toISOString().slice(0, 10);
  if (note) entry.note = note;
  saveQueue(queue);
  return entry;
}

// ---------- commands ----------

export function populate() {
  const syllabus = JSON.parse(fs.readFileSync(SYLLABUS_PATH, "utf-8"));
  const queue = loadQueue();
  for (const chapter of syllabus.chapters) {
    for (const section of chapter.sections ?? []) {
      let entry = queue.entries.find((e) => e.id === section.id);
      if (!entry) {
        entry = { id: section.id, chapter: chapter.title, title: section.title, attempts: 0, note: "" };
        queue.entries.push(entry);
      }
      entry.title = section.title;
      entry.chapter = chapter.title;
      entry.status = fs.existsSync(path.join(CONTENT_DIR, `${section.id}.json`)) ? "done" : (entry.status ?? "pending");
    }
  }
  queue.entries.sort(byId);
  saveQueue(queue);
  return queue.entries.length;
}

export function nextPending() {
  const entry = loadQueue().entries.find((e) => e.status === "pending" || e.status === "in_progress");
  return entry ?? null;
}

export const start = (id) => setStatus(id, "in_progress");
export const done = (id, note) => setStatus(id, "done", note);
export const fail = (id, note) => setStatus(id, "failed", note);
export const reset = (id) => setStatus(id, "pending");

export function recordAttempt(id) {
  const queue = loadQueue();
  const entry = findEntry(queue, id);
  entry.attempts = (entry.attempts ?? 0) + 1;
  saveQueue(queue);
}

// ---------- manifest ----------

// content/index.json is derived: rebuilt from whatever valid sections exist.
export function buildIndex() {
  const syllabus = JSON.parse(fs.readFileSync(SYLLABUS_PATH, "utf-8"));
  const sections = [];
  for (const file of fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").sort()) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), "utf-8"));
      const steps = (doc.sections ?? []).reduce((n, s) => n + (s.steps?.length ?? 0), 0);
      sections.push({ id: doc.id ?? file.replace(".json", ""), chapter: doc.chapter, section: doc.section, file: `content/${file}`, steps });
    } catch {
      // a section mid-generation is not manifest material yet
    }
  }
  sections.sort((a, b) => {
    const [aMaj, aMin] = a.id.split(".").map(Number);
    const [bMaj, bMin] = b.id.split(".").map(Number);
    return aMaj - bMaj || aMin - bMin;
  });
  const index = { book: syllabus.book, author: syllabus.author, sections };
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
  return index;
}

export function findSpec(id) {
  const syllabus = JSON.parse(fs.readFileSync(SYLLABUS_PATH, "utf-8"));
  for (const chapter of syllabus.chapters) {
    for (const section of chapter.sections ?? []) {
      if (section.id === id) return { chapter, section };
    }
  }
  return null;
}

function byId(a, b) {
  const [aMaj, aMin] = a.id.split(".").map(Number);
  const [bMaj, bMin] = b.id.split(".").map(Number);
  return aMaj - bMaj || aMin - bMin;
}

// ---------- CLI ----------

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, id, ...rest] = process.argv.slice(2);
  const note = rest.join(" ");
  const commands = {
    populate: () => console.log(`queue populated: ${populate()} sections`),
    list: () => {
      const { entries } = loadQueue();
      if (!entries.length) return console.log("(empty — run: npm run queue -- populate)");
      for (const e of entries) {
        console.log(`${e.status.padEnd(12)} ${e.id.padEnd(5)} ${e.title}${e.note ? `  — ${e.note}` : ""}`);
      }
    },
    next: () => {
      const entry = nextPending();
      console.log(entry ? `${entry.id}\t${entry.title}` : "");
    },
    start: () => console.log(`${start(id).id}: in_progress`),
    done: () => console.log(`${done(id, note).id}: done${note ? ` — ${note}` : ""}`),
    fail: () => console.log(`${fail(id, note).id}: failed${note ? ` — ${note}` : ""}`),
    reset: () => console.log(`${reset(id).id}: pending`),
    reindex: () => {
      const index = buildIndex();
      console.log(`content/index.json: ${index.sections.length} sections`);
    },
  };
  if (!commands[command]) {
    console.error(`unknown command "${command}" — see header of pipeline/queue.mjs`);
    process.exit(1);
  }
  commands[command]();
}
