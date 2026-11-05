'use strict';
/* =========================================================
   Движок шахмат + оригинальные варианты.
   Варианты: classic, weaklink, double, rotation, chameleon
   ========================================================= */

const FILES = 'abcdefgh';
const KNIGHT_D = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const KING_D   = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const DIAG_D   = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTHO_D  = [[1,0],[-1,0],[0,1],[0,-1]];

const inB = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const sqName = i => FILES[i % 8] + (Math.floor(i / 8) + 1);
const parseSq = s => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
const opp = c => (c === 'w' ? 'b' : 'w');

const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const RANK = { p: 1, n: 2, b: 2, r: 3, q: 4, k: 9 };
const GLYPH = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
};

// может ли attacker взять target в варианте "Слабое звено"
function canCapture(s, attacker, target) {
  if (s.variant !== 'weaklink') return true;
  if (target.t === 'k') return false;
  return RANK[attacker.t] >= RANK[target.t];
}

const VARIANTS = {
  classic: {
    name: 'Классика',
    tag: 'База',
    desc: 'Обычные шахматы. Ничего лишнего — чтобы вспомнить правила.',
    rules: ['Стандартные правила: мат, пат, рокировка, взятие на проходе, превращение пешки.']
  },
  weaklink: {
    name: 'Слабое звено',
    tag: 'Тактический',
    desc: 'Фигура может брать только фигуру своего достоинства или ниже. Сильные фигуры боятся мелких!',
    rules: [
      'Достоинства: пешка 1, конь = слон 2, ладья 3, ферзь 4.',
      'Фигура берёт только фигуру с достоинством не выше своего.',
      'Пешка может брать только пешку. Ферзь может брать кого угодно.',
      'Короля брать нельзя — как обычно, побеждает мат.'
    ]
  },
  double: {
    name: 'Двойной ход',
    tag: 'Детский',
    desc: 'Каждый ход состоит из двух последовательных ходов одной стороной.',
    rules: [
      'За один ход вы делаете два любых легальных хода подряд.',
      'Можно ходить одной и той же фигурой дважды.',
      'Мат первым же полуходом сразу заканчивает партию.'
    ]
  },
  rotation: {
    name: 'Вращающаяся доска',
    tag: 'Хаотичный',
    desc: 'Каждые 4 полных хода вся доска поворачивается на 90° против часовой. Пешки своего направления не меняют!',
    rules: [
      'После каждых 8 полуходов (4 хода каждой стороны) доска поворачивается на 90° против часовой стрелки.',
      'Все фигуры перемещаются вместе с клетками.',
      'Белые пешки всегда идут вверх, чёрные — всегда вниз.'
    ]
  },
  chameleon: {
    name: 'Хамелеон',
    tag: 'Превращающийся',
    desc: 'Фигура, которая походила, меняет облик: Ф→Л→С→К→П→Ф.',
    rules: [
      'После каждого хода походившая фигура превращается по циклу: ферзь→ладья→слон→конь→пешка→ферзь.',
      'Король не меняется.',
      'Пешка, походив, становится ферзем.'
    ]
  }
};

function initialState(variant) {
  const board = Array(64).fill(null);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    board[f] = { t: back[f], c: 'w', dir: 1 };
    board[8 + f] = { t: 'p', c: 'w', dir: 1 };
    board[48 + f] = { t: 'p', c: 'b', dir: -1 };
    board[56 + f] = { t: back[f], c: 'b', dir: -1 };
  }
  return {
    board, turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, variant,
    movesLeft: variant === 'double' ? 2 : 1,
    ply: 0, lastMove: null
  };
}

function kingSq(board, c) {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.t === 'k' && p.c === c) return i;
  }
  return -1;
}

function attacksSquare(board, sq, by) {
  const sf = sq % 8, sr = Math.floor(sq / 8);
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.c !== by) continue;
    const f = i % 8, r = Math.floor(i / 8);
    if (p.t === 'p') {
      if (r + p.dir === sr && Math.abs(f - sf) === 1) return true;
      continue;
    }
    if (p.t === 'n') {
      if (KNIGHT_D.some(d => f + d[0] === sf && r + d[1] === sr)) return true;
      continue;
    }
    if (p.t === 'k') {
      if (KING_D.some(d => f + d[0] === sf && r + d[1] === sr)) return true;
      continue;
    }
    const dirs = p.t === 'r' ? ORTHO_D : p.t === 'b' ? DIAG_D : KING_D;
    for (const d of dirs) {
      let nf = f + d[0], nr = r + d[1];
      while (inB(nf, nr)) {
        const j = nr * 8 + nf;
        if (j === sq) return true;
        if (board[j]) break;
        nf += d[0]; nr += d[1];
      }
    }
  }
  return false;
}

function pseudoMoves(s, color) {
  const moves = [];
  const b = s.board;
  const allowEp = s.variant !== 'rotation';
  const allowCastle = s.variant !== 'rotation';

  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || p.c !== color) continue;
    const f = i % 8, r = Math.floor(i / 8);
    const add = (to, extra) => moves.push(Object.assign({ from: i, to }, extra || {}));

    if (p.t === 'p') {
      const nr = r + p.dir;
      if (inB(f, nr) && !b[nr * 8 + f]) {
        if ((color === 'w' && nr === 7) || (color === 'b' && nr === 0)) {
          for (const pr of ['q', 'r', 'b', 'n']) add(nr * 8 + f, { promo: pr });
        } else {
          add(nr * 8 + f);
        }
        const startR = color === 'w' ? 1 : 6;
        const nr2 = r + 2 * p.dir;
        if (r === startR && !b[nr * 8 + f] && !b[nr2 * 8 + f]) add(nr2 * 8 + f, { dbl: true });
      }
      for (const df of [-1, 1]) {
        const nf = f + df;
        if (!inB(nf, nr)) continue;
        const to = nr * 8 + nf;
        if (b[to] && b[to].c !== color && canCapture(s, p, b[to])) {
          if ((color === 'w' && nr === 7) || (color === 'b' && nr === 0)) {
            for (const pr of ['q', 'r', 'b', 'n']) add(to, { promo: pr });
          } else add(to);
        } else if (!b[to] && allowEp && s.ep === to && Math.abs(s.ep % 8 - f) === 1) {
          add(to, { ep: true });
        }
      }
    } else if (p.t === 'n' || p.t === 'k') {
      const dirs = p.t === 'n' ? KNIGHT_D : KING_D;
      for (const d of dirs) {
        const nf = f + d[0], nr = r + d[1];
        if (!inB(nf, nr)) continue;
        const to = nr * 8 + nf;
        if (!b[to] || (b[to].c !== color && canCapture(s, p, b[to]))) add(to);
      }
      if (p.t === 'k' && allowCastle) {
        const home = color === 'w' ? 0 : 56;
        if (i === home + 4 && !attacksSquare(b, i, opp(color))) {
          if (color === 'w' && s.castling.wK && !b[5] && !b[6] && b[7] && b[7].t === 'r' &&
              !attacksSquare(b, 5, 'b') && !attacksSquare(b, 6, 'b')) add(6, { castle: 'K' });
          if (color === 'w' && s.castling.wQ && !b[1] && !b[2] && !b[3] && b[0] && b[0].t === 'r' &&
              !attacksSquare(b, 3, 'b') && !attacksSquare(b, 2, 'b')) add(2, { castle: 'Q' });
          if (color === 'b' && s.castling.bK && !b[61] && !b[62] && b[63] && b[63].t === 'r' &&
              !attacksSquare(b, 61, 'w') && !attacksSquare(b, 62, 'w')) add(62, { castle: 'K' });
          if (color === 'b' && s.castling.bQ && !b[57] && !b[58] && !b[59] && b[56] && b[56].t === 'r' &&
              !attacksSquare(b, 59, 'w') && !attacksSquare(b, 58, 'w')) add(58, { castle: 'Q' });
        }
      }
    } else {
      const dirs = p.t === 'r' ? ORTHO_D : p.t === 'b' ? DIAG_D : KING_D;
      for (const d of dirs) {
        let nf = f + d[0], nr = r + d[1];
        while (inB(nf, nr)) {
          const to = nr * 8 + nf;
          if (!b[to]) add(to);
          else { if (b[to].c !== color && canCapture(s, p, b[to])) add(to); break; }
          nf += d[0]; nr += d[1];
        }
      }
    }
  }
  return moves;
}

function rotateBoard(board) {
  const nb = Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const f = i % 8, r = Math.floor(i / 8);
    const nf = r, nr = 7 - f; // поворот на 90° против часовой стрелки
    // направление пешек сохраняется: белые всегда вверх, чёрные — вниз
    nb[nr * 8 + nf] = { t: p.t, c: p.c, dir: p.dir };
  }
  return nb;
}

/* ---------- make / unmake (без клонирования доски) ---------- */
function makeMove(s, m) {
  const b = s.board;
  const p = b[m.from];
  const undo = {
    ep: s.ep, castling: Object.assign({}, s.castling),
    movesLeft: s.movesLeft, turn: s.turn, ply: s.ply, lastMove: s.lastMove,
    captured: null, capSq: null, prevType: p.t, oldBoard: null
  };

  if (m.ep) {
    undo.capSq = m.to + (p.c === 'w' ? -8 : 8);
    undo.captured = b[undo.capSq];
    b[undo.capSq] = null;
  } else if (b[m.to]) {
    undo.captured = b[m.to];
    undo.capSq = m.to;
  }

  b[m.to] = p;
  b[m.from] = null;
  if (m.promo) p.t = m.promo;

  if (m.castle) {
    if (m.castle === 'K') {
      if (p.c === 'w') { b[5] = b[7]; b[7] = null; }
      else { b[61] = b[63]; b[63] = null; }
    } else {
      if (p.c === 'w') { b[3] = b[0]; b[0] = null; }
      else { b[59] = b[56]; b[56] = null; }
    }
  }

  if (p.t === 'k') {
    if (p.c === 'w') { s.castling.wK = false; s.castling.wQ = false; }
    else { s.castling.bK = false; s.castling.bQ = false; }
  }
  if (m.from === 7 || m.to === 7) s.castling.wK = false;
  if (m.from === 0 || m.to === 0) s.castling.wQ = false;
  if (m.from === 63 || m.to === 63) s.castling.bK = false;
  if (m.from === 56 || m.to === 56) s.castling.bQ = false;

  s.ep = m.dbl ? (m.from + m.to) / 2 : null;
  s.lastMove = { from: m.from, to: m.to };
  s.ply++;

  if (s.variant === 'chameleon' && p.t !== 'k') {
    const cyc = { q: 'r', r: 'b', b: 'n', n: 'p', p: 'q' };
    p.t = cyc[p.t];
  }

  if (s.variant === 'rotation' && s.ply % 8 === 0) {
    undo.oldBoard = s.board;
    s.board = rotateBoard(s.board);
    if (s.lastMove) {
      const rot = i => { const f = i % 8, r = Math.floor(i / 8); return (7 - f) * 8 + r; };
      s.lastMove = { from: rot(s.lastMove.from), to: rot(s.lastMove.to) };
    }
  }

  if (s.variant === 'double') {
    s.movesLeft--;
    if (s.movesLeft <= 0) { s.turn = opp(s.turn); s.movesLeft = 2; }
  } else {
    s.turn = opp(s.turn);
  }
  return undo;
}

function unmakeMove(s, m, undo) {
  const b = s.board;
  if (undo.oldBoard) s.board = undo.oldBoard;
  const bb = s.board;
  const p = bb[m.to];
  bb[m.from] = p;
  bb[m.to] = null;
  if (undo.capSq !== null && undo.capSq !== undefined) bb[undo.capSq] = undo.captured;
  p.t = undo.prevType;

  if (m.castle) {
    if (m.castle === 'K') {
      if (p.c === 'w') { bb[7] = bb[5]; bb[5] = null; }
      else { bb[63] = bb[61]; bb[61] = null; }
    } else {
      if (p.c === 'w') { bb[0] = bb[3]; bb[3] = null; }
      else { bb[56] = bb[59]; bb[59] = null; }
    }
  }

  s.ep = undo.ep;
  s.castling = undo.castling;
  s.movesLeft = undo.movesLeft;
  s.turn = undo.turn;
  s.ply = undo.ply;
  s.lastMove = undo.lastMove;
}

function legalMoves(s, color) {
  const res = [];
  for (const m of pseudoMoves(s, color)) {
    // в двойном режиме промежуточный шах после 1-го полухода допустим —
    // король обязан быть в безопасности только в конце полного хода
    const endsTurn = s.variant !== 'double' || s.movesLeft === 1;
    const u = makeMove(s, m);
    const k = kingSq(s.board, color);
    const ok = k !== -1 && (!endsTurn || !attacksSquare(s.board, k, opp(color)));
    unmakeMove(s, m, u);
    if (ok) res.push(m);
  }
  return res;
}

function gameStatus(s) {
  // взятый король = поражение (а не пат!)
  if (kingSq(s.board, 'w') === -1) return { over: true, winner: 'b', reason: 'Белый король взят!' };
  if (kingSq(s.board, 'b') === -1) return { over: true, winner: 'w', reason: 'Чёрный король взят!' };
  // двойной ход: если после первого полухода соперник уже заматован — партия окончена
  if (s.variant === 'double' && s.movesLeft === 1) {
    const oppColor = opp(s.turn);
    if (legalMoves(s, oppColor).length === 0 &&
        attacksSquare(s.board, kingSq(s.board, oppColor), s.turn)) {
      return { over: true, winner: s.turn, reason: 'Мат!' };
    }
  }
  const moves = legalMoves(s, s.turn);
  if (moves.length === 0) {
    if (attacksSquare(s.board, kingSq(s.board, s.turn), opp(s.turn))) {
      return { over: true, winner: opp(s.turn), reason: 'Мат!' };
    }
    return { over: true, winner: null, reason: 'Пат — ничья.' };
  }
  return { over: false };
}

/* ---------- ИИ: negamax + alpha-beta + quiescence + iterative deepening ---------- */
const MATE = 100000;

// позиционные таблицы (с точки зрения белых, индекс 0 = a8 … 63 = h1)
const PST = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
};

function evaluate(s, jitter) {
  let score = 0;
  // небольшой бонус за темп — как на lichess, стартовая позиция чуть в плюс белым
  score += s.turn === 'w' ? 12 : -12;
  const b = s.board;
  let wB = 0, bB = 0;
  const filePawns = { w: [0,0,0,0,0,0,0,0], b: [0,0,0,0,0,0,0,0] };

  // в «Хамелеоне» фигуры постоянно меняют тип, реальная сила меньше номинала
  const decay = s.variant === 'chameleon' ? 0.85 : 1;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    // PST-таблицы записаны с a8 (индекс 0); доска индексируется с a1 (r=0 — 1-я горизонталь)
    const f = i % 8, r = Math.floor(i / 8);
    const pi = p.c === 'w' ? (7 - r) * 8 + f : r * 8 + f;
    const v = (PIECE_VAL[p.t] + PST[p.t][pi]) * decay;
    if (p.c === 'w') { score += v; if (p.t === 'b') wB++; }
    else { score -= v; if (p.t === 'b') bB++; }
    if (p.t === 'p') filePawns[p.c][i % 8]++;
  }
  if (wB >= 2) score += 30;
  if (bB >= 2) score -= 30;

  // структура пешек
  for (const c of ['w', 'b']) {
    const sign = c === 'w' ? 1 : -1;
    const fp = filePawns[c];
    for (let f = 0; f < 8; f++) {
      if (fp[f] > 1) score += sign * -12 * (fp[f] - 1); // сдвоенные
      const left = f > 0 ? fp[f - 1] : 0;
      const right = f < 7 ? fp[f + 1] : 0;
      if (left === 0 && right === 0 && fp[f] > 0) score += sign * -15; // изолированные
    }
    // проходные: нет вражеских пешек ВПЕРЕДИ на своей и соседних вертикалях
    const ef = filePawns[opp(c)];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || p.t !== 'p' || p.c !== c) continue;
      const f = i % 8, r = Math.floor(i / 8);
      let blocked = false;
      for (const ff of [f - 1, f, f + 1]) {
        if (ff < 0 || ff > 7) continue;
        for (let rr = 0; rr < 8; rr++) {
          const q = b[rr * 8 + ff];
          if (q && q.t === 'p' && q.c === opp(c)) {
            const aheadOf = c === 'w' ? rr > r : rr < r;
            if (aheadOf) { blocked = true; break; }
          }
        }
        if (blocked) break;
      }
      if (!blocked) {
        const adv = c === 'w' ? r - 1 : 6 - r;
        score += sign * (10 + adv * 8);
      }
    }
  }
  return score + (jitter === false ? 0 : Math.random() * 3);
}

function moveScore(s, m) {
  let sc = 0;
  const target = s.board[m.to] || (m.ep ? { t: 'p' } : null);
  if (target) sc += 10 * RANK[target.t] - RANK[s.board[m.from].t]; // MVV-LVA
  if (m.promo) sc += 900;
  if (m.castle) sc += 50;
  return sc;
}

function orderMoves(s, moves) {
  for (const m of moves) m._sc = moveScore(s, m);
  moves.sort((a, b) => b._sc - a._sc);
  return moves;
}

let nodes = 0;
let deadline = 0;

function checkTime() {
  if ((++nodes & 2047) === 0 && Date.now() > deadline) throw 'timeout';
}

function inCheck(s, color) {
  return attacksSquare(s.board, kingSq(s.board, color), opp(color));
}

function negamax(s, depth, alpha, beta, ply) {
  checkTime();
  // взятый король = мат
  if (kingSq(s.board, s.turn) === -1) return -MATE + ply;
  if (kingSq(s.board, opp(s.turn)) === -1) return MATE - ply;
  if (depth === 0) return quiesce(s, alpha, beta, ply);

  const moves = orderMoves(s, legalMoves(s, s.turn));
  if (moves.length === 0) {
    if (inCheck(s, s.turn)) return -MATE + ply;
    return 0;
  }
  // двойной ход: мат после первого полухода
  if (s.variant === 'double' && s.movesLeft === 1) {
    const oc = opp(s.turn);
    if (legalMoves(s, oc).length === 0 && inCheck(s, oc)) return MATE - ply;
  }

  let best = -Infinity;
  for (const m of moves) {
    const t = s.turn;
    const u = makeMove(s, m);
    let v;
    try {
      // в двойном режиме после первого полухода ход остаётся за той же стороной — знак не меняем
      v = (s.turn === t)
        ? negamax(s, depth - 1, alpha, beta, ply + 1)
        : -negamax(s, depth - 1, -beta, -alpha, ply + 1);
    } finally { unmakeMove(s, m, u); }
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function quiesce(s, alpha, beta, ply) {
  checkTime();
  if (kingSq(s.board, s.turn) === -1) return -MATE + ply;
  if (kingSq(s.board, opp(s.turn)) === -1) return MATE - ply;
  const chk = inCheck(s, s.turn);
  if (!chk) {
    const stand = (s.turn === 'w' ? 1 : -1) * evaluate(s);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  }
  if (ply > 14) return (s.turn === 'w' ? 1 : -1) * evaluate(s);

  let moves = legalMoves(s, s.turn);
  if (moves.length === 0) return chk ? -MATE + ply : 0; // мат/пат на горизонте
  // двойной ход: мат сопернику после первого полухода
  if (s.variant === 'double' && s.movesLeft === 1) {
    const oc = opp(s.turn);
    if (legalMoves(s, oc).length === 0 && inCheck(s, oc)) return MATE - ply;
  }
  if (!chk) moves = moves.filter(m => s.board[m.to] || m.ep || m.promo);
  orderMoves(s, moves);
  for (const m of moves) {
    const t = s.turn;
    const u = makeMove(s, m);
    let v;
    try {
      v = (s.turn === t)
        ? quiesce(s, alpha, beta, ply + 1)
        : -quiesce(s, -beta, -alpha, ply + 1);
    } finally { unmakeMove(s, m, u); }
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

// итеративный deepening с лимитом времени; maxDepth — страховочный потолок
function bestMove(s, maxDepth, timeMs) {
  deadline = Date.now() + (timeMs || 1500);
  nodes = 0;
  const rootMoves = orderMoves(s, legalMoves(s, s.turn));
  if (!rootMoves.length) return null;
  let best = rootMoves[0];

  let bestV = -Infinity;
  let scored = [];
  for (let depth = 1; depth <= (maxDepth || 6); depth++) {
    let currentV = -Infinity;
    const depthScored = [];
    try {
      for (const m of rootMoves) {
        const t = s.turn;
        const u = makeMove(s, m);
        let v;
        try {
          v = (s.turn === t)
            ? negamax(s, depth - 1, -Infinity, Infinity, 1)
            : -negamax(s, depth - 1, -Infinity, Infinity, 1);
        } finally { unmakeMove(s, m, u); }
        depthScored.push({ m, v });
        if (v > currentV) currentV = v;
      }
    } catch (e) { break; }
    if (depthScored.length) { scored = depthScored; bestV = currentV; }
    if (currentV > MATE - 1000) break; // нашли форсированный мат
    if (Date.now() > deadline) break;
  }
  // разнообразие: случайно выбираем среди ходов в пределах 25сп от лучшего
  if (!scored.length) return rootMoves[0];
  const candidates = scored.filter(x => x.v >= bestV - 25);
  const pool = candidates.length ? candidates : scored;
  return pool[Math.floor(Math.random() * pool.length)].m;
}

function moveToStr(s, m) {
  const p = s.board[m.from];
  let str = (p.t === 'p' ? '' : GLYPH[p.c][p.t]) + sqName(m.from) + (s.board[m.to] || m.ep ? 'x' : '-') + sqName(m.to);
  if (m.promo) str += '=' + GLYPH[p.c][m.promo];
  if (m.castle === 'K') str = 'O-O';
  if (m.castle === 'Q') str = 'O-O-O';
  return str;
}
