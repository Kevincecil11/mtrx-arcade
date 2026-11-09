# MTRX™ Arcade

Designed by MTRX™ · Property of MTRX Digital

Static site. No build step. Host the folder on Cloudflare Pages, GitHub Pages or Netlify. Fonts load from Fontshare (Tanker) and Google Fonts (Nunito Sans).
It must be served over http(s): the puzzle builder and AI run in Web Workers, which browsers block on `file://`.

Local test: `npx serve .` (or `python3 -m http.server`) in this folder, then open http://localhost:3000.

## Open-source engines (loaded from jsDelivr, esm.sh fallback)
- Sudoku: sudoku-core v4 (MIT, Komeil Mehranfar). Unique puzzles rated L1-L10 by the hardest technique needed; teachHint powers "Teach me a move".
- Checkers: rapid-draughts 1.0.6 (MIT, loks0n). English draughts rules, bitboard move generation, alpha-beta search.

## Difficulty design
Sudoku: Easy L2 · Medium L4 · Intermediate L5 · Hard L7 · Expert L8.
Checkers (search depth / random-move rate): Easy 2 / 60% · Medium 3 / 20% · Intermediate 5 / 6% · Hard 7 / 0% + random opening · Expert 9 / 0% + random opening ballot.
All randomness comes from crypto.getRandomValues.
