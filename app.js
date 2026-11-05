'use strict';
/* ---------- UI хаба и игрового экрана ---------- */

const hubEl = document.getElementById('hub');
const gameEl = document.getElementById('game');
const cardsEl = document.getElementById('variant-cards');
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const movelistEl = document.getElementById('movelist');
const gameTitleEl = document.getElementById('game-title');
const variantInfoEl = document.getElementById('variant-info');
const promoOverlay = document.getElementById('promo-overlay');
const promoChoices = document.getElementById('promo-choices');

let state = null;
let variantKey = null;
let mode = 'ai';            // 'ai' | 'local'
let selected = null;        // выбранная клетка (индекс доски)
let legalCache = [];
let history = [];           // [{str, color}] — один элемент на полуход
let undoStack = [];         // undo-объекты makeMove
let aiThinking = false;

const pieceImg = (c, t) => `pieces/${c}${t.toUpperCase()}.svg`;
// ориентация: кем ходит игрок — та сторона снизу
function orientation() { return mode === 'local' ? state.turn : 'w'; }

/* ---------- Хаб ---------- */
function renderHub() {
  cardsEl.innerHTML = '';
  for (const key of Object.keys(VARIANTS)) {
    const v = VARIANTS[key];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <span class="tag">${v.tag}</span>
      <h3>${v.name}</h3>
      <p>${v.desc}</p>
      <ul>${v.rules.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="play-row">
        <button class="btn" data-mode="ai">🤖 С компьютером</button>
        <button class="btn" data-mode="local">👥 Вдвоём</button>
      </div>`;
    card.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => startGame(key, btn.dataset.mode));
    });
    cardsEl.appendChild(card);
  }
}

/* ---------- Игра ---------- */
function startGame(key, m) {
  variantKey = key;
  mode = m;
  state = initialState(key);
  selected = null;
  history = [];
  undoStack = [];
  aiThinking = false;
  hubEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  gameTitleEl.textContent = VARIANTS[key].name;
  variantInfoEl.innerHTML = `<b>${VARIANTS[key].name}</b><ul>${VARIANTS[key].rules.map(r => `<li>${r}</li>`).join('')}</ul>`;
  movelistEl.innerHTML = '';
  document.getElementById('mode-ai').classList.toggle('active', mode === 'ai');
  document.getElementById('mode-local').classList.toggle('active', mode === 'local');
  render();
}

function backToHub() {
  gameEl.classList.add('hidden');
  hubEl.classList.remove('hidden');
}

function render() {
  renderBoard();
  renderStatus();
  renderMoves();
  queueEval();
}

/* ---------- «честный» eval: считаем поиском, а не статикой ---------- */
let evalScoreCp = null;   // оценка в сантипешках с точки зрения белых (уже с поиском)
let evalPly = -1;         // на каком полуходе считали
let evalBusy = false;

function queueEval() {
  if (!state) return;
  // в двойном режиме считаем один раз за полный ход (оба полухода — единый план)
  if (state.variant === 'double' && state.movesLeft === 1) return;
  if (state.ply === evalPly || evalBusy) return;
  evalPly = state.ply;
  evalBusy = true;
  // дисплей не ждём: считаем асинхронно, неглубоко, но с quiescence — взятия просчитаны наперёд
  setTimeout(() => {
    let v = null;
    const st = gameStatus(state);
    if (st.over) {
      if (!st.winner) v = 0;
      else v = (st.winner === 'w' ? 1 : -1) * (MATE - 100);
    } else {
      deadline = Date.now() + 1200;
      nodes = 0;
      const color = state.turn;
      let bestV = -Infinity;
      for (const m of legalMoves(state, color)) {
        const t = state.turn;
        const u = makeMove(state, m);
        let val;
        try {
          val = (state.turn === t)
            ? negamax(state, 4, -Infinity, Infinity, 1)
            : -negamax(state, 4, -Infinity, Infinity, 1);
        } catch (e) { val = -Infinity; }
        finally { unmakeMove(state, m, u); }
        if (val > bestV) bestV = val;
      }
      v = (color === 'w') ? bestV : -bestV; // в перспективу белых
    }
    evalScoreCp = v;
    evalBusy = false;
    updateEvalBar();
  }, 30);
}

function updateEvalBar() {
  const bar = document.getElementById('evalbar');
  const fill = document.getElementById('evalfill');
  const txt = document.getElementById('evaltext');
  if (!bar || !state) return;
  let evW = (evalScoreCp !== null ? evalScoreCp : evaluate(state, false)) / 100;
  let label;
  if (Math.abs(evalScoreCp || 0) > MATE - 1000) {
    evW = evW > 0 ? 99 : -99;
    label = '#';
  } else {
    label = (evW > 0 ? '+' : '') + evW.toFixed(1);
  }
  // бар следует ориентации доски
  const o = orientation();
  const ev = o === 'w' ? evW : -evW;
  const clamped = Math.max(-9.9, Math.min(9.9, ev));
  fill.style.height = (50 + (clamped / 9.9) * 50) + '%';
  txt.textContent = label;
}

function renderBoard() {
  boardEl.innerHTML = '';
  const st = gameStatus(state);
  const inCheck = !st.over && attacksSquare(state.board, kingSq(state.board, state.turn), opp(state.turn));
  const checkSq = inCheck ? kingSq(state.board, state.turn) : -1;
  const legalTargets = selected !== null
    ? legalCache.filter(m => m.from === selected).map(m => m.to) : [];
  const o = orientation();

  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      // экранные координаты -> индекс доски
      const r = o === 'w' ? 7 - dr : dr;
      const f = o === 'w' ? dc : 7 - dc;
      const i = r * 8 + f;
      const sq = document.createElement('div');
      sq.className = 'sq ' + ((f + r) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.sq = i;
      if (state.lastMove && (state.lastMove.from === i || state.lastMove.to === i)) sq.classList.add('last');
      if (selected === i) sq.classList.add('selected');
      if (checkSq === i) sq.classList.add('in-check');
      const p = state.board[i];
      if (p) {
        const img = document.createElement('img');
        img.src = pieceImg(p.c, p.t);
        img.alt = p.c + p.t;
        img.draggable = false;
        sq.appendChild(img);
        // в «Вращающейся доске» показываем направление пешки
        if (state.variant === 'rotation' && p.t === 'p') {
          const dir = document.createElement('span');
          dir.className = 'pawn-dir';
          dir.textContent = p.dir === 1 ? '▲' : '▼';
          sq.appendChild(dir);
        }
      }
      if (legalTargets.includes(i)) {
        const mark = document.createElement('span');
        mark.className = state.board[i] ? 'ring' : 'dot';
        sq.appendChild(mark);
      }
      if (dc === 0) {
        const c = document.createElement('span');
        c.className = 'coord rank'; c.textContent = r + 1;
        sq.appendChild(c);
      }
      if (dr === 7) {
        const c = document.createElement('span');
        c.className = 'coord file'; c.textContent = FILES[f];
        sq.appendChild(c);
      }
      sq.addEventListener('click', () => onSquareClick(i));
      boardEl.appendChild(sq);
    }
  }
}

function renderStatus() {
  const st = gameStatus(state);
  const turnName = state.turn === 'w' ? 'Белые' : 'Чёрные';
  if (st.over) {
    statusEl.textContent = st.winner
      ? `🏆 ${st.reason} Победа: ${st.winner === 'w' ? 'белые' : 'чёрные'}!`
      : `🤝 ${st.reason}`;
    return;
  }
  const inCheck = attacksSquare(state.board, kingSq(state.board, state.turn), opp(state.turn));
  let extra = state.variant === 'double' && state.movesLeft === 1 ? ' (остался 1 ход)' : '';
  statusEl.textContent = `Ход: ${turnName}${inCheck ? ' — ШАХ!' : ''}${extra}`;
}

function renderMoves() {
  // группируем полуходы в ходы: 1. e4 e5 — в double-ход = два полухода одной стороны
  const rows = [];
  if (state.variant === 'double') {
    let i = 0, num = 1;
    while (i < history.length) {
      const color = history[i].color;
      const parts = [];
      while (i < history.length && history[i].color === color && parts.length < 2) {
        parts.push(history[i].str); i++;
      }
      rows.push(`${num}. ${parts.join(' ')}`);
      num++;
    }
  } else {
    for (let i = 0; i < history.length; i += 2) {
      rows.push(`${i / 2 + 1}. ${history[i].str}${history[i + 1] ? ' ' + history[i + 1].str : ''}`);
    }
  }
  movelistEl.innerHTML = rows.map(r => `<li>${r}</li>`).join('');
  movelistEl.scrollTop = movelistEl.scrollHeight;
}

function tryMove(from, to) {
  if (!state || aiThinking || gameStatus(state).over) return false;
  if (mode === 'ai' && state.turn === 'b') return false;
  const promos = legalCache.filter(m => m.from === from && m.to === to && m.promo);
  if (promos.length) {
    const color = state.board[from].c;
    askPromotion(color, (promo) => doMove({ from, to, promo }));
    return true;
  }
  const move = legalCache.find(m => m.from === from && m.to === to);
  if (move) { doMove(move); return true; }
  return false;
}

function onSquareClick(i) {
  if (!state || aiThinking) return;
  if (justDragged) { justDragged = false; return; }
  const st = gameStatus(state);
  if (st.over) return;
  if (mode === 'ai' && state.turn === 'b') return; // ход компьютера

  const p = state.board[i];
  if (selected !== null && tryMove(selected, i)) return;
  if (p && p.c === state.turn) {
    selected = i;
    legalCache = legalMoves(state, state.turn);
  } else {
    selected = null;
    legalCache = [];
  }
  renderBoard();
}

/* ---------- перетаскивание ---------- */
let drag = null;        // {from, img}
let justDragged = false;

function moveGhost(e) {
  drag.img.style.left = (e.clientX - 36) + 'px';
  drag.img.style.top = (e.clientY - 36) + 'px';
}

boardEl.addEventListener('pointerdown', (e) => {
  if (!state || aiThinking || gameStatus(state).over) return;
  if (mode === 'ai' && state.turn === 'b') return;
  const sqEl = e.target.closest('.sq');
  if (!sqEl) return;
  const i = +sqEl.dataset.sq;
  const p = state.board[i];
  if (!p || p.c !== state.turn) return;
  selected = i;
  legalCache = legalMoves(state, state.turn);
  const img = document.createElement('img');
  img.src = pieceImg(p.c, p.t);
  img.className = 'drag-ghost';
  document.body.appendChild(img);
  drag = { from: i, img };
  moveGhost(e);
  renderBoard();
  e.preventDefault();
});

document.addEventListener('pointermove', (e) => { if (drag) moveGhost(e); });

document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const from = drag.from;
  drag.img.remove();
  drag = null;
  // не даём втиснуть ход, пока бот думает или партия окончена
  if (!state || aiThinking || gameStatus(state).over || (mode === 'ai' && state.turn === 'b')) {
    selected = null; legalCache = [];
    renderBoard();
    return;
  }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const sqEl = el && el.closest ? el.closest('.sq') : null;
  if (sqEl) {
    const to = +sqEl.dataset.sq;
    if (to !== from) {
      justDragged = true;
      if (!tryMove(from, to)) { selected = null; legalCache = []; renderBoard(); }
    }
  } else {
    renderBoard();
  }
});

function askPromotion(color, cb) {
  promoChoices.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    // берём уже загруженную в память картинку (клон), новой загрузки нет
    const cached = pieceCache[pieceImg(color, t)];
    const img = cached ? cached.cloneNode() : document.createElement('img');
    if (!cached) img.src = pieceImg(color, t);
    img.alt = t;
    b.appendChild(img);
    b.addEventListener('click', () => {
      promoOverlay.classList.add('hidden');
      cb(t);
    });
    promoChoices.appendChild(b);
  }
  promoOverlay.classList.remove('hidden');
}

function doMove(m) {
  const beforePly = state.ply;
  history.push({ str: moveToStr(state, m), color: state.turn });
  undoStack.push({ m, u: makeMove(state, m) });
  selected = null;
  legalCache = [];
  render();
  // анимация поворота доски во «Вращающейся доске"
  if (state.variant === 'rotation' && state.ply % 8 === 0 && state.ply !== beforePly) animateRotation();
  maybeAiMove();
}

function animateRotation() {
  // новая позиция уже = старая, повёрнутая на 90° против часовой;
  // начинаем с обратного поворота и плавно возвращаемся — выглядит как вращение
  boardEl.style.transition = 'none';
  boardEl.style.transform = 'rotate(90deg)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    boardEl.style.transition = 'transform .6s ease';
    boardEl.style.transform = 'rotate(0deg)';
  }));
}

function undoMove() {
  if (!state || aiThinking || !undoStack.length) return;
  // в игре с компьютером откатываем и ход бота, и ход игрока
  const times = mode === 'ai' ? 2 : 1;
  for (let k = 0; k < times && undoStack.length; k++) {
    const u = undoStack.pop();
    history.pop();
    unmakeMove(state, u.m, u.u);
  }
  selected = null;
  legalCache = [];
  render();
}

function maybeAiMove() {
  const st = gameStatus(state);
  if (st.over || mode !== 'ai' || state.turn !== 'b') return;
  aiThinking = true;
  statusEl.textContent = '🤖 Компьютер думает…';
  setTimeout(() => {
    // в двойном режиме ветвление вдвое больше — даём боту больше времени
    const m = bestMove(state, 6, state.variant === 'double' ? 3000 : 2000);
    aiThinking = false;
    if (m) doMove(m);
  }, 300);
}

/* ---------- Кнопки ---------- */
document.getElementById('btn-back').addEventListener('click', backToHub);
document.getElementById('btn-undo').addEventListener('click', undoMove);
document.getElementById('btn-restart').addEventListener('click', () => startGame(variantKey, mode));
document.getElementById('mode-ai').addEventListener('click', () => startGame(variantKey, 'ai'));
document.getElementById('mode-local').addEventListener('click', () => startGame(variantKey, 'local'));

/* ---------- Экран загрузки: ждём все фигуры и держим их в памяти ---------- */
const pieceCache = {};
(function preload() {
  const files = [];
  for (const c of ['w', 'b']) for (const t of ['K', 'Q', 'R', 'B', 'N', 'P']) files.push(`pieces/${c}${t}.svg`);
  let left = files.length;
  const done = () => { if (--left === 0) document.getElementById('loading').classList.add('hidden'); };
  for (const f of files) {
    const im = new Image();
    im.onload = done;
    im.onerror = done;
    im.src = f;
    pieceCache[f] = im;
  }
  // страховка: не висеть вечно
  setTimeout(() => document.getElementById('loading').classList.add('hidden'), 5000);
})();

renderHub();
