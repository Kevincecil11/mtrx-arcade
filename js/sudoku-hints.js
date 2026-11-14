// MTRX™ Arcade · Sudoku hint ladder. Built on sudoku-core (MIT) teachHint. Designed by MTRX™
// Hint 1 is the easiest logical step on your board. Each next hint builds on the one before it, the way a
// coach talks you through a position, until it reaches a digit you can place. From a digit, the next hint
// finds a different cell. Only when logic has nothing left does a hint simply reveal an answer.

const R = (i) => Math.floor(i / 9), C = (i) => i % 9, B = (i) => Math.floor(R(i) / 3) * 3 + Math.floor(C(i) / 3);
const HOUSES = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3))),
];
const PEERS = Array.from({ length: 81 }, (_, i) => { const s = new Set(); for (const h of HOUSES) if (h.includes(i)) h.forEach((j) => j !== i && s.add(j)); return [...s]; });
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const houseOf = (kind, i) => (kind === 0 ? R(i) : kind === 1 ? 9 + C(i) : 18 + B(i));
const houseName = (h) => (h < 9 ? `row ${h + 1}` : h < 18 ? `column ${h - 8}` : `box ${h - 17}`);
const houseKind = (h) => (h < 9 ? 'Row' : h < 18 ? 'Column' : 'Box');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (a) => (a.length < 2 ? String(a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const where = (i) => `row ${R(i) + 1}, column ${C(i) + 1}`;
const zeros = (b) => b.map((v) => v || 0);
const nulls = (b) => b.map((v) => v || null);
const MAX_SKIP = 40;

/** Candidates from placed digits only (what you'd pencil in with no other logic). */
export function legalCands(board) {
  return board.map((v, i) => {
    if (v) return [];
    const used = new Set(PEERS[i].map((j) => board[j]).filter(Boolean));
    return DIGITS.filter((d) => !used.has(d));
  });
}

/**
 * One ladder of hints for the board as it stands. Every hint is an object:
 * { n, tag, kind: 'elim'|'place'|'reveal'|'fix', label, text, focus, digit, region, related,
 *   x: [[cell, digit]] crossed-out candidates, g: [[cell, digit]] pattern candidates, nextLabel, canSkip }
 */
export function createHintSession({ lib, values, solution, rand = Math.random }) {
  const real = values.map((v) => v || null);
  let ws = { board: zeros(real), cands: legalCands(real) }; // the working grid: real digits + what earlier hints ruled out
  const out = new Map(); // cell → Map(digit → hint number that crossed it out, 0 = a skipped step)
  const shown = new Set(); // cells already handed out as digits
  let n = 0, cur = null, peek = null;
  const safe = (f) => { try { return f(); } catch { return null; } };
  const ruledBy = (i, d) => out.get(i)?.get(d);
  const who = (nums) => {
    const hs = [...new Set(nums.filter((x) => x > 0))].sort((a, b) => a - b), parts = [];
    if (hs.length) parts.push(hs.length === 1 ? `hint ${hs[0]}` : `hints ${list(hs)}`);
    if (nums.some((x) => x === 0)) parts.push('the skipped steps');
    return list(parts) || 'earlier steps';
  };

  // A digit, explained from the board you can see plus whatever earlier hints crossed out
  function placeHint(cell, d, tag, libLabel, libText) {
    const h = { kind: 'place', tag, focus: cell, digit: d, region: [], related: [], x: [], g: [[cell, d]] };
    const seen = [...new Set(PEERS[cell].map((j) => real[j]).filter(Boolean))].sort((a, b) => a - b);
    if (ws.cands[cell].length === 1) { // naked single
      const gone = DIGITS.filter((x) => x !== d && !seen.includes(x));
      gone.forEach((x) => h.x.push([cell, x]));
      h.label = 'Naked Single';
      h.text = gone.length
        ? `${cap(where(cell))} and box ${B(cell) + 1} already use ${list(seen)}, and ${who(gone.map((x) => ruledBy(cell, x)))} ruled out ${list(gone)} (crossed out). That leaves only ${d}.`
        : `Its row, column and box already use every other digit, so this cell must be ${d}.`;
      return h;
    }
    for (const kind of [2, 0, 1]) { // hidden single, box first: it's the easiest to see
      const hi = houseOf(kind, cell), house = HOUSES[hi];
      const spots = house.filter((i) => !ws.board[i] && ws.cands[i].includes(d));
      if (spots.length !== 1 || spots[0] !== cell) continue;
      const blockers = new Set(), crossed = [];
      for (const y of house) {
        if (y === cell || ws.board[y]) continue;
        const b = PEERS[y].find((j) => real[j] === d);
        if (b != null) blockers.add(b); else crossed.push(y);
      }
      crossed.forEach((y) => h.x.push([y, d]));
      h.region = house.slice(); h.related = [...blockers];
      h.label = `Hidden Single (${houseKind(hi)})`;
      const by = who(crossed.map((y) => ruledBy(y, d)));
      h.text = `${cap(houseName(hi))} needs a ${d} somewhere, and this is the only cell left for it. ` + (blockers.size && crossed.length
        ? `The other empty cells either already see a ${d} (outlined) or were ruled out by ${by} (crossed out).`
        : blockers.size ? `Every other empty cell in it already sees a ${d} (outlined).` : `${cap(by)} ruled ${d} out of the other cells (crossed out).`);
      return h;
    }
    h.label = libLabel || 'Next digit';
    h.text = libText || `Logic places ${d} here.`;
    return h;
  }
  function elimHint(tip, tag) {
    const x = (tip.elimMarks || []).filter((m) => !ws.board[m.index] && ws.cands[m.index]?.includes(m.digit)).map((m) => [m.index, m.digit]);
    if (!x.length) return null;
    const g = [];
    for (const c of tip.digitCells || []) for (const d of tip.patternDigits || []) {
      if (!ws.board[c] && ws.cands[c]?.includes(d) && !x.some(([i, e]) => i === c && e === d)) g.push([c, d]);
    }
    return { kind: 'elim', tag, label: tip.label || 'Next step', text: tip.explanation || 'Look at the highlighted cells.', focus: -1, digit: null,
      region: tip.regionCells || [], related: tip.relatedCells || [], x, g };
  }
  function fromTip(tip, tag) {
    if (!tip) return null;
    if (tip.type === 'value' && tip.focusCell != null && tip.digit != null) {
      if (solution && solution[tip.focusCell] !== tip.digit) return null; // never teach a digit that isn't the answer
      return placeHint(tip.focusCell, tip.digit, tag, tip.label, tip.explanation);
    }
    return elimHint(tip, tag);
  }
  // a straight answer, chosen to open the board up: the cell whose digit creates the most new singles
  function reveal(tag, why) {
    const empty = real.map((v, i) => (v || shown.has(i) ? -1 : i)).filter((i) => i >= 0);
    if (!empty.length || !solution) return null;
    const score = (i) => {
      const d = solution[i], board = ws.board.slice(), cands = ws.cands.map((c) => c.slice());
      board[i] = d; cands[i] = []; for (const j of PEERS[i]) cands[j] = cands[j].filter((e) => e !== d);
      return countSingles(board, cands);
    };
    const scored = empty.map((i) => [i, score(i)]), top = Math.max(...scored.map((s) => s[1]));
    const best = scored.filter((s) => s[1] === top).map((s) => s[0]);
    const i = best[Math.floor(rand() * best.length)], d = solution[i];
    return { kind: 'reveal', tag, label: `${cap(where(i))} is ${d}`, text: `${why}${top ? ' This one opens up the cells around it.' : ''}`, focus: i, digit: d, region: [], related: [], x: [], g: [[i, d]] };
  }
  function countSingles(board, cands) {
    const cells = new Set();
    for (let i = 0; i < 81; i++) if (!board[i] && cands[i].length === 1) cells.add(i);
    for (const house of HOUSES) for (const d of DIGITS) {
      if (house.some((i) => board[i] === d)) continue;
      const spots = house.filter((i) => !board[i] && cands[i].includes(d));
      if (spots.length === 1) cells.add(spots[0]);
    }
    shown.forEach((i) => cells.delete(i)); // digits already handed out don't count as new
    return cells.size;
  }
  // every naked or hidden single in the working grid, minus cells already handed out; picked at random
  function pickSingle() {
    const found = new Map();
    for (let i = 0; i < 81; i++) if (!ws.board[i] && ws.cands[i].length === 1) found.set(i, ws.cands[i][0]);
    for (const house of HOUSES) for (const d of DIGITS) {
      if (house.some((i) => ws.board[i] === d)) continue;
      const spots = house.filter((i) => !ws.board[i] && ws.cands[i].includes(d));
      if (spots.length === 1) found.set(spots[0], d);
    }
    const pool = [...found].filter(([i, d]) => !shown.has(i) && (!solution || solution[i] === d));
    if (!pool.length) return null;
    const [cell, d] = pool[Math.floor(rand() * pool.length)];
    return { cell, d };
  }
  // an elimination hint's crossings now hold in the working grid, so the next hint can build on them
  function advance(h, by) {
    for (const [i, d] of h.x) {
      const k = ws.cands[i].indexOf(d);
      if (k < 0) continue;
      ws.cands[i] = ws.cands[i].filter((e) => e !== d);
      if (!out.has(i)) out.set(i, new Map());
      out.get(i).set(d, by);
    }
  }
  const nextStep = (tag) => fromTip(safe(() => lib.teachHint(nulls(ws.board), ws.cands.map((c) => c.slice()), 'continue')), tag);
  function following(h) {
    if (h.kind === 'fix') return null;
    if (h.kind === 'elim') { const nx = nextStep(`Hint ${n + 1} · builds on hint ${n}`); if (nx) return nx; }
    const s = pickSingle();
    if (s) return placeHint(s.cell, s.d, `Hint ${n + 1} · a different cell`);
    return reveal(`Hint ${n + 1} · straight answer`, 'Logic has no other digit ready right now, so here is a straight answer.');
  }
  function present(h) {
    n++; h.n = n; cur = h;
    if (h.kind === 'place' || h.kind === 'reveal') shown.add(h.focus);
    if (h.kind === 'elim') advance(h, n);
    peek = following(h);
    const what = !peek ? '' : peek.kind === 'elim' ? 'next step' : peek.kind === 'reveal' ? 'reveal a cell' : h.kind === 'elim' ? 'the digit' : 'another cell';
    h.nextLabel = peek ? `Hint ${n + 1}: ${what}` : '';
    h.canSkip = h.kind === 'elim' && peek?.kind === 'elim';
    return h;
  }

  return {
    get cur() { return cur; },
    first() {
      const wrong = solution ? real.findIndex((v, i) => v && v !== solution[i]) : -1;
      if (wrong >= 0) {
        return present({ kind: 'fix', tag: 'Hint 1 · fix first', label: 'Fix this cell first', focus: wrong, digit: null, region: [], related: [], x: [], g: [],
          text: `The ${real[wrong]} in ${where(wrong)} is not part of the solution. Logic can't continue from a wrong digit.` });
      }
      const h = fromTip(safe(() => lib.teachHint(nulls(real))), 'Hint 1 · technique')
        || reveal('Hint 1 · straight answer', 'No named technique applies cleanly here, so here is a straight answer.');
      return h ? present(h) : null;
    },
    next() { if (!cur || !peek) return null; const h = peek; peek = null; return present(h); },
    // jump over a run of eliminations straight to the digit they unlock
    skip() {
      if (!cur || cur.kind !== 'elim' || peek?.kind !== 'elim') return null;
      let h = peek, k = 0; const t0 = performance.now();
      while (h && h.kind === 'elim' && k < MAX_SKIP && performance.now() - t0 < 700) { advance(h, 0); k++; h = nextStep(''); }
      if (!h || h.kind === 'elim') { const s = pickSingle(); h = s ? placeHint(s.cell, s.d, '') : reveal('', 'That chain runs long, so here is a straight answer.'); }
      if (!h) return null;
      h.tag = `Hint ${n + 1} · skipped ${k} step${k === 1 ? '' : 's'}`;
      peek = null;
      return present(h);
    },
  };
}
