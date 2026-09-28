// engine.js — a section reads like an article: the text scrolls, the board
// follows the step in view, and the board is always alive. Quizzes lock the
// board until solved (or shown); anywhere else you can move pieces freely.
// Loads the section named by ?s=<id> (see content/*.json for the format).
/* global Chess, PIECES */

// ---------- Board ----------

class Board {
  constructor(el) {
    this.el = el;
    this.pieceEls = {}; // square -> element
    this.build();
  }

  build() {
    this.el.innerHTML = `
      <div class="squares"></div>
      <div class="pieces"></div>
      <svg class="shapes" viewBox="0 0 8 8"></svg>
      <div class="cover"></div>`;
    this.squaresEl = this.el.querySelector(".squares");
    this.piecesEl = this.el.querySelector(".pieces");
    this.shapesEl = this.el.querySelector(".shapes");
    this.coverEl = this.el.querySelector(".cover");
    const files = "abcdefgh";
    for (let r = 8; r >= 1; r--) {
      for (let f = 0; f < 8; f++) {
        const d = document.createElement("div");
        d.className = "square " + ((f + r) % 2 ? "light" : "dark");
        if (r === 1) d.dataset.coord = files[f];
        if (f === 0) d.dataset.coord = (d.dataset.coord || "") + r;
        this.squaresEl.appendChild(d);
      }
    }
    this.el.addEventListener("click", (e) => {
      const sq = this.squareFromEvent(e);
      if (sq && this.onSquare) this.onSquare(sq);
    });
  }

  setPosition(fen) {
    this.piecesEl.innerHTML = "";
    this.pieceEls = {};
    const rows = fen.split(" ")[0].split("/");
    rows.forEach((row, i) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { file += +ch; continue; }
        const color = ch === ch.toUpperCase() ? "w" : "b";
        this.addPiece(color + ch.toUpperCase(), "abcdefgh"[file] + (8 - i));
        file++;
      }
    });
    this.clearShapes();
  }

  addPiece(key, square) {
    const d = document.createElement("div");
    d.className = "piece";
    d.style.backgroundImage = `url(${PIECES[key]})`;
    this.piecesEl.appendChild(d);
    this.pieceEls[square] = d;
    this.place(d, square);
    return d;
  }

  place(d, square) {
    const f = "abcdefgh".indexOf(square[0]);
    const r = +square[1];
    d.style.transform = `translate(${f * 100}%, ${(8 - r) * 100}%)`;
  }

  animateMove(m) {
    return new Promise((resolve) => {
      const captured = m.captured ? this.squareOfCapture(m.to, m.color) : null;
      if (captured) {
        captured.classList.add("dying");
        setTimeout(() => captured.remove(), 260);
      }
      const piece = this.pieceEls[m.from];
      delete this.pieceEls[m.from];
      this.pieceEls[m.to] = piece;
      this.place(piece, m.to);
      if (m.promotion) {
        setTimeout(() => {
          piece.style.backgroundImage =
            `url(${PIECES[(m.color === "w" ? "w" : "b") + m.promotion.toUpperCase()]})`;
        }, 280);
      }
      if (m.san.startsWith("O-O")) {
        const rank = m.color === "w" ? 1 : 8;
        const queenside = m.san === "O-O-O";
        const rookFrom = (queenside ? "a" : "h") + rank;
        const rookTo = (queenside ? "d" : "f") + rank;
        const rook = this.pieceEls[rookFrom];
        if (rook) {
          delete this.pieceEls[rookFrom];
          this.pieceEls[rookTo] = rook;
          this.place(rook, rookTo);
        }
      }
      setTimeout(resolve, 340);
    });
  }

  squareOfCapture(to, moverColor) {
    if (this.pieceEls[to]) return this.pieceEls[to];
    const side = moverColor === "w" ? to[0] + (+to[1] - 1) : to[0] + (+to[1] + 1);
    return this.pieceEls[side] || null;
  }

  setShapes(arrows = [], circles = [], highlights = []) {
    this.clearShapes();
    const ns = "http://www.w3.org/2000/svg";
    const center = (s) => ["abcdefgh".indexOf(s[0]) + 0.5, 8 - (+s[1]) + 0.5];
    for (const sq of highlights) {
      const [x, y] = center(sq);
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x", x - 0.5); r.setAttribute("y", y - 0.5);
      r.setAttribute("width", 1); r.setAttribute("height", 1);
      r.setAttribute("fill", "rgba(226,167,94,.55)");
      this.shapesEl.appendChild(r);
    }
    for (const sq of circles) {
      const [x, y] = center(sq);
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 0.44);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", "#e2a75e");
      c.setAttribute("stroke-width", 0.055);
      this.shapesEl.appendChild(c);
    }
    for (const [from, to] of arrows) {
      let [x1, y1] = center(from), [x2, y2] = center(to);
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const pad = 0.26;
      x1 += (dx / len) * pad; y1 += (dy / len) * pad;
      x2 -= (dx / len) * pad; y2 -= (dy / len) * pad;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", x1); line.setAttribute("y1", y1);
      line.setAttribute("x2", x2); line.setAttribute("y2", y2);
      line.setAttribute("stroke", "#e2a75e");
      line.setAttribute("stroke-width", 0.11);
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", "0.9");
      this.shapesEl.appendChild(line);
      const head = document.createElementNS(ns, "polygon");
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux, w = 0.13, l = 0.3;
      head.setAttribute("points",
        `${x2},${y2} ${x2 - ux * l + px * w},${y2 - uy * l + py * w} ${x2 - ux * l - px * w},${y2 - uy * l - py * w}`);
      head.setAttribute("fill", "#e2a75e");
      head.setAttribute("opacity", "0.9");
      this.shapesEl.appendChild(head);
    }
  }

  clearShapes() {
    this.shapesEl.innerHTML = "";
  }

  showDots(squares) {
    this.hideDots();
    const ns = "http://www.w3.org/2000/svg";
    for (const sq of squares) {
      const x = "abcdefgh".indexOf(sq[0]) + 0.5, y = 8 - (+sq[1]) + 0.5;
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y);
      c.setAttribute("r", 0.13);
      c.setAttribute("fill", "rgba(20,20,20,.4)");
      c.dataset.dot = "1";
      this.shapesEl.appendChild(c);
    }
  }

  hideDots() {
    this.shapesEl.querySelectorAll("[data-dot]").forEach((d) => d.remove());
  }

  select(square) {
    this.selected = square;
    this.el.querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
    const idx = "abcdefgh".indexOf(square[0]) + (8 - (+square[1])) * 8;
    this.squaresEl.children[idx]?.classList.add("selected");
  }

  deselect() {
    this.selected = null;
    this.el.querySelectorAll(".selected").forEach((e) => e.classList.remove("selected"));
    this.hideDots();
  }

  shake() {
    this.el.classList.remove("shake");
    void this.el.offsetWidth;
    this.el.classList.add("shake");
  }

  hidePieces(hidden) {
    this.el.classList.toggle("blindfold", hidden);
  }

  squareFromEvent(e) {
    const r = this.el.getBoundingClientRect();
    const f = Math.floor(((e.clientX - r.left) / r.width) * 8);
    const row = Math.floor(((e.clientY - r.top) / r.height) * 8);
    if (f < 0 || f > 7 || row < 0 || row > 7) return null;
    return "abcdefgh"[f] + (8 - row);
  }
}

// ---------- Reader ----------

const $ = (sel) => document.querySelector(sel);
const sameMove = (m, sanSolution) =>
  m.san.replace(/[+#!?]/g, "") === sanSolution.replace(/[+#!?]/g, "");

class Reader {
  constructor(lesson) {
    this.lesson = lesson;
    this.steps = [];
    for (const sec of lesson.sections) {
      sec.steps.forEach((s, i) => {
        s._section = sec.title;
        s._firstOfSection = i === 0;
        this.steps.push(s);
      });
    }
    this.precompute();
    this.active = -1;
    this.token = 0;      // invalidates in-flight animations when the active step changes
    this.quiz = null;    // { step, game, misses } while the active quiz is unsolved
    this.freeGame = null; // created the moment the reader moves a piece off-script
    this.flash = null;   // { step } while a memory test runs
    this.ply = 0;        // how many moves of the active step the board has played
    this.displayFen = lesson.baseFen;
    this.buildArticles();
    this.wireBoard();
    this.observe();
    this.wireKeys();
    $("#chapter-head").textContent = `${lesson.chapter} · ${lesson.section}`;
    document.title = lesson.section;
  }

  // resolve every step's real start position once — same replay the validator does
  precompute() {
    let cur = new Chess(this.lesson.baseFen);
    for (const s of this.steps) {
      s._startFen = s.fen || cur.fen();
      const g = new Chess(s._startFen);
      s._verbose = [];
      s._fens = [g.fen()];
      for (const san of s.moves || []) {
        const m = g.move(san);
        if (m) {
          s._verbose.push(m);
          s._fens.push(g.fen());
        }
      }
      s._quizMove = s.quiz ? g.move(s.quiz.solution) : null;
      cur = g;
    }
  }

  buildArticles() {
    const wrap = $("#steps");
    this.articles = this.steps.map((s, i) => {
      const art = document.createElement("article");
      art.className = "step";
      const head = s._firstOfSection
        ? `<div class="section-head"><span>${s._section}</span></div>` : "";
      art.innerHTML = `${head}
        <h2>${s.title || ""}</h2>
        <div class="step-text">${(s.text || "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</div>
        <div class="quiz-zone" data-zone="${i}"></div>`;
      wrap.appendChild(art);
      return art;
    });
  }

  wireBoard() {
    this.board = new Board($("#board"));
    this.board.onSquare = (sq) => this.onSquare(sq);
  }

  observe() {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = this.articles.indexOf(e.target);
        if (i !== -1 && i !== this.active) this.setActive(i);
      }
    }, { rootMargin: "-42% 0px -42% 0px", threshold: 0 });
    this.articles.forEach((a) => io.observe(a));
  }

  wireKeys() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") this.scrollToStep(this.active + 1);
      if (e.key === "ArrowLeft") this.scrollToStep(this.active - 1);
    });
  }

  scrollToStep(i) {
    if (i < 0 || i >= this.steps.length) return;
    this.articles[i].scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- the board follows the reading ----------

  async setActive(i) {
    const token = ++this.token;
    const prev = this.active;
    this.active = i;
    this.progress();
    this.cancelFlash();
    this.board.deselect();
    this.quiz = null;
    this.freeGame = null;
    this.setStatus("");

    const s = this.steps[i];
    this.renderStrip(s);
    if (s.flash) { this.runFlash(s, token); return; }

    // entering from the step right above: the board is already in place and
    // this step's moves play on. Anywhere else: jump first.
    if (i !== prev + 1) this.board.setPosition(s._startFen);
    for (let k = 0; k < s._verbose.length; k++) {
      await this.board.animateMove(s._verbose[k]);
      if (token !== this.token) return;
      this.ply = k + 1;
      this.markPly();
    }
    if (s.quiz && s._solved && s._quizMove) {
      await this.board.animateMove(s._quizMove);
      if (token !== this.token) return;
    }
    this.displayFen = this.stepEndFen(s);
    this.board.setShapes(s.arrows, s.circles, s.highlight);

    if (s.quiz && !s._solved) this.armQuiz(s);
  }

  // ---------- move strip: scrub + replay the active step ----------

  renderStrip(s) {
    const strip = $("#movestrip");
    this.ply = s._verbose.length;
    if (s.flash || s._verbose.length === 0) {
      strip.style.display = "none";
      strip.innerHTML = "";
      return;
    }
    strip.style.display = "flex";
    const parts = [`<button class="link" id="replay">⟲ replay</button>`];
    s._verbose.forEach((m, k) => {
      const num = k % 2 === 0 ? `<i>${k / 2 + 1}.</i>` : "";
      parts.push(`<span class="ply" data-ply="${k + 1}">${num}${m.san}</span>`);
    });
    strip.innerHTML = parts.join("");
    strip.querySelector("#replay").addEventListener("click", () => this.replayStep());
    strip.querySelectorAll(".ply").forEach((el) => {
      el.addEventListener("click", () => this.jumpPly(+el.dataset.ply));
    });
    this.markPly();
  }

  markPly() {
    const strip = $("#movestrip");
    strip.querySelectorAll(".ply").forEach((el) => {
      el.classList.toggle("cur", +el.dataset.ply === this.ply);
    });
  }

  jumpPly(k) {
    const s = this.steps[this.active];
    if (!s || k < 0 || k > s._verbose.length) return;
    if (this.quiz) return; // the quiz position is fixed until solved
    this.token++; // cancel any in-flight animation of this step
    this.ply = k;
    this.board.deselect();
    this.board.setPosition(s._fens[k]);
    this.board.setShapes(s.arrows, s.circles, s.highlight);
    this.displayFen = s._fens[k];
    this.markPly();
  }

  async replayStep() {
    const s = this.steps[this.active];
    if (!s || this.quiz) return;
    const token = ++this.token;
    this.board.deselect();
    this.ply = 0;
    this.board.setPosition(s._startFen);
    this.board.setShapes([], [], []);
    this.markPly();
    for (let k = 0; k < s._verbose.length; k++) {
      await this.board.animateMove(s._verbose[k]);
      if (token !== this.token) return;
      this.ply = k + 1;
      this.markPly();
    }
    this.board.setShapes(s.arrows, s.circles, s.highlight);
    this.displayFen = this.stepEndFen(s);
  }

  // the position a step leaves the board in: its moves, plus the quiz
  // solution if the reader has seen it
  stepEndFen(s) {
    const g = new Chess(s._startFen);
    for (const m of s._verbose) g.move(m.san);
    if (s.quiz && s._solved && s._quizMove) g.move(s.quiz.solution);
    return g.fen();
  }

  progress() {
    const pct = ((this.active + 1) / this.steps.length) * 100;
    $("#bar").style.width = pct + "%";
    $("#pos").textContent = `${this.active + 1} / ${this.steps.length}`;
  }

  setStatus(html) {
    $("#status").innerHTML = html;
  }

  // ---------- clicks: quiz first, free play everywhere else ----------

  onSquare(sq) {
    if (this.flash) return; // the position is supposed to live in your head
    const s = this.steps[this.active];
    if (!s) return;

    if (this.quiz) {
      this.playOn(this.quiz.game, sq, (attempted) => {
        if (attempted && sameMove(attempted, s.quiz.solution)) {
          const q = this.quiz;
          this.quiz = null;
          this.board.animateMove(attempted).then(() => this.finishQuiz(q.step, "Solved"));
        } else {
          this.quiz.game.undo(); // the board never played it; the game must not either
          this.quiz.misses++;
          this.zoneNote(s, "Not it. Look at checks, captures and threats first.");
          this.zoneShowSolution(s);
        }
      });
      return;
    }

    if (!this.freeGame) this.freeGame = new Chess(this.displayFen);
    this.playOn(this.freeGame, sq, (attempted) => {
      if (!attempted) return;
      this.board.animateMove(attempted);
      this.setStatus(`<button class="link" id="reset-board">reset the board</button>`);
      $("#reset-board").addEventListener("click", () => this.setActive(this.active));
    });
  }

  // shared selection + move attempt. onAttempted gets a legal attempted move
  // (already applied to `game`) or null (clicked a non-square / illegal spot).
  playOn(game, sq, onAttempted) {
    const g = game;
    if (this.board.selected) {
      const from = this.board.selected;
      if (sq === from) { this.board.deselect(); return; }
      const legal = g.moves({ square: from, verbose: true }).some((m) => m.to === sq);
      if (!legal) {
        const p = g.get(sq);
        if (p && p.color === g.turn()) { this.trySelect(sq, g); return; }
        this.board.deselect();
        return;
      }
      const attempted = g.move({ from, to: sq, promotion: "q" });
      this.board.deselect();
      onAttempted(attempted);
      return;
    }
    this.trySelect(sq, g);
  }

  trySelect(sq, g) {
    const p = g.get(sq);
    if (p && p.color === g.turn()) {
      const targets = g.moves({ square: sq, verbose: true }).map((m) => m.to);
      this.board.select(sq);
      this.board.showDots(targets);
    }
  }

  // ---------- quizzes ----------

  armQuiz(s) {
    const g = new Chess(s._startFen);
    for (const m of s._verbose) g.move(m.san);
    this.quiz = { step: s, game: g, misses: 0 };
    this.setStatus(`<span class="quiz">Your move — ${g.turn() === "w" ? "White" : "Black"} to play.</span>`);
  }

  zone(s) {
    return this.articles[this.steps.indexOf(s)].querySelector(".quiz-zone");
  }

  zoneNote(s, message) {
    this.zone(s).innerHTML = `<p class="note">${message}</p>`;
  }

  zoneShowSolution(s) {
    if (this.zone(s).querySelector(".link")) return;
    const b = document.createElement("button");
    b.className = "link";
    b.textContent = "show the move";
    b.addEventListener("click", () => {
      if (!this.quiz || this.quiz.step !== s) return;
      this.quiz = null;
      this.board.animateMove(s._quizMove).then(() => this.finishQuiz(s, "The move"));
    });
    this.zone(s).appendChild(b);
  }

  finishQuiz(s, label) {
    s._solved = true;
    this.displayFen = this.stepEndFen(s);
    this.setStatus("");
    this.zone(s).innerHTML = `<p class="praise"><span class="verdict">${label} ✓</span>${s.quiz.praise
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>")}</p>`;
  }

  // ---------- memory test ----------

  runFlash(s, token) {
    this.flash = { step: s };
    this.board.setShapes([], [], []);
    let left = s.flash.seconds;
    this.board.coverEl.innerHTML = `<div class="count">${left}</div>`;
    this.board.coverEl.classList.add("on");
    const tick = setInterval(() => {
      left--;
      if (token !== this.token) { clearInterval(tick); return; }
      if (left > 0) {
        this.board.coverEl.innerHTML = `<div class="count">${left}</div>`;
        return;
      }
      clearInterval(tick);
      if (token !== this.token) return;
      this.board.hidePieces(true);
      this.board.coverEl.classList.remove("on");
      this.askFlash(s, s.flash.questions, 0, 0);
    }, 1000);
  }

  askFlash(s, questions, idx, score) {
    const box = this.zone(s);
    if (idx >= questions.length) {
      this.flash = null;
      this.board.hidePieces(false);
      box.innerHTML = `<p class="praise"><span class="verdict">${score} / ${questions.length} correct</span>${
        score === questions.length
          ? "Perfect recall — you were chunking, not counting pieces."
          : "The board is back — look at what you missed, then keep reading."}</p>`;
      return;
    }
    const q = questions[idx];
    box.innerHTML = `<p class="flash-q">${idx + 1}. ${q.q}</p>` +
      q.options.map((o, i) => `<button class="flash-opt" data-i="${i}">${o}</button>`).join(" ");
    box.querySelectorAll(".flash-opt").forEach((b) => {
      b.addEventListener("click", () => {
        if (this.zone(s).querySelector(".flash-opt:disabled")) return;
        const got = +b.dataset.i === q.answer;
        b.classList.add(got ? "good" : "bad");
        box.querySelectorAll(".flash-opt").forEach((x) => {
          if (+x.dataset.i === q.answer) x.classList.add("good");
          x.disabled = true;
        });
        setTimeout(() => this.askFlash(s, questions, idx + 1, score + (got ? 1 : 0)), 700);
      });
    });
  }

  cancelFlash() {
    if (!this.flash) return;
    const s = this.flash.step;
    this.flash = null;
    this.board.coverEl.classList.remove("on");
    this.board.hidePieces(false);
    this.zone(s).innerHTML = "";
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(location.search).get("s") ?? "1.1";
  let lesson;
  try {
    const res = await fetch(`../content/${id}.json`);
    if (!res.ok) throw new Error(res.status);
    lesson = await res.json();
  } catch {
    $("#steps").innerHTML = `<p>No section “${id}” yet. <a href="index.html">Back to the contents.</a></p>`;
    return;
  }
  window.reader = new Reader(lesson);
  buildFooter(id);
});

async function buildFooter(id) {
  let index;
  try {
    index = await (await fetch("../content/index.json")).json();
  } catch {
    return;
  }
  const i = index.sections.findIndex((s) => s.id === id);
  const prev = index.sections[i - 1];
  const next = index.sections[i + 1];
  const html = [];
  html.push(`<span>${prev ? `<a href="?s=${prev.id}">← ${prev.section}</a>` : ""}</span>`);
  html.push(`<a href="index.html">contents</a>`);
  html.push(`<span>${next ? `<a href="?s=${next.id}">${next.section} →</a>` : ""}</span>`);
  html.push(`<span class="hint"><span class="kbd">←</span> <span class="kbd">→</span> move between steps</span>`);
  $("#foot").innerHTML = html.join("");
}
