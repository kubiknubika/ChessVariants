// двойной режим: король может взять защищённую фигуру и уйти вторым полуходом
let g = initialState('double');
g.board = Array(64).fill(null);
g.board[parseSq('e1')] = { t: 'k', c: 'w', dir: 1 };
g.board[parseSq('e8')] = { t: 'k', c: 'b', dir: -1 };
g.board[parseSq('e4')] = { t: 'k', c: 'w', dir: 1 }; g.board[parseSq('e1')] = null; // белый король e4
g.board[parseSq('d5')] = { t: 'p', c: 'b', dir: -1 }; // пешка d5 под защитой e6
g.board[parseSq('e6')] = { t: 'p', c: 'b', dir: -1 };
const kxd5 = legalMoves(g, 'w').find(m => m.from === parseSq('e4') && m.to === parseSq('d5'));
console.log('Kxd5 доступно в double:', !!kxd5, '(нужно true — вторым ходом уйдём от e6)');
// в классике тот же ход запрещён (король под боем)
let c = initialState('classic');
c.board = g.board.map(p => p ? { t: p.t, c: p.c, dir: p.dir } : null);
console.log('Kxd5 в классике:', legalMoves(c, 'w').some(m => m.from === parseSq('e4') && m.to === parseSq('d5')), '(нужно false)');
// после Kxd5 — ход всё ещё белых, и есть ход ухода
if (kxd5) {
  const u = makeMove(g, kxd5);
  console.log('после Kxd5: turn', g.turn, 'movesLeft', g.movesLeft, 'ходов ухода:', legalMoves(g, 'w').length);
  unmakeMove(g, kxd5, u);
}
// бот в double видит такую комбинацию: поставим боту позицию с Kxd5 + уход
// регрессия
for (const v of Object.keys(VARIANTS)) {
  const t = initialState(v); let n = 0, end = null;
  while (n < 100) { const st = gameStatus(t); if (st.over) { end = st.reason; break; } const mm = legalMoves(t, t.turn); if (!mm.length) { end = 'nm'; break; } makeMove(t, mm[Math.floor(Math.random() * mm.length)]); n++; }
  console.log(v.padEnd(10), 'sim100:', end || 'ok');
}
// ботvsбот double — маты в 1 не пропускает
let t = initialState('double'); let n = 0, end = null, missed = 0;
while (n < 40) {
  const st = gameStatus(t); if (st.over) { end = st.reason; break; }
  const color = t.turn;
  const m1 = legalMoves(t, color).filter(m => { const u = makeMove(t, m); const s2 = gameStatus(t); unmakeMove(t, m, u); return s2.over && s2.winner === color; });
  const bm = bestMove(t, 5, 1500);
  if (m1.length && bm) { const u = makeMove(t, bm); const s2 = gameStatus(t); unmakeMove(t, bm, u); if (!(s2.over && s2.winner === color)) missed++; }
  if (!bm) break;
  makeMove(t, bm); n++;
}
console.log('double ботvsбот:', end || 'ok 40 п/ходов', '| пропущено матов:', missed);
