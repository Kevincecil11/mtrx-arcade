# MTRX™ Arcade

Designed by MTRX™ · Property of MTRX Digital

Static site. No build step. Host the folder on Cloudflare Pages, GitHub Pages or Netlify. Fonts load from Fontshare (Tanker) and Google Fonts (Nunito Sans).
It must be served over http(s): the puzzle builder and AI run in Web Workers, which browsers block on `file://`.

Local test: `npx serve .` (or `python3 -m http.server`) in this folder, then open http://localhost:3000.

## Open-source engines (loaded from jsDelivr, esm.sh fallback)
- Sudoku: sudoku-core v4 (MIT, Komeil Mehranfar). Unique puzzles rated L1-L10 by the hardest technique needed; teachHint powers "Teach me a move".
- Checkers: MTRX checkers engine (js/checkers-engine.js). English draughts with a switch for optional or forced jumps, alpha-beta search with transposition table. Written in-house because rapid-draughts (MIT) can't turn compulsory capture off.

## Difficulty design
Sudoku: Easy L2 · Medium L4 · Intermediate L5 · Hard L7 · Expert L8.
Checkers (search depth / random-move rate): Easy 2 / 50% · Medium 3 / 18% · Intermediate 5 / 5% · Hard 7 / 0%, random among equal moves · Expert 10+ (1.5 s per move) / 0%, random opening. Tested in self-play: every level beat the one below it.
All randomness comes from crypto.getRandomValues.
