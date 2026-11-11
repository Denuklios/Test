// Kleine Spiele und Spielereien mit den eigenen Fotos
import { icon } from '../icons.js';
import { store } from '../store.js';
import { el, blobUrl, toast, shuffle, fmtDate, relTime, sleep } from '../util.js';
import { openLayer } from '../layers.js';
import { pickPhoto, pickSource, loadOriginal, confetti } from './common.js';
import { openViewer } from '../viewer.js';
import { lookalikes } from '../faces.js';
import { scaledCanvas } from '../util.js';

// ---------- Schiebepuzzle ----------
export const puzzle = {
  name: 'Schiebepuzzle',
  emoji: '🧠',
  desc: 'Bring dein Foto wieder in Ordnung',
  bg: 'linear-gradient(135deg,#11998e,#38ef7d)',
  async run() {
    const photo = await pickPhoto('Welches Foto als Puzzle?');
    if (photo) openPuzzle(photo);
  },
};

async function openPuzzle(photo) {
  const L = openLayer({ title: 'Schiebepuzzle' });
  const game = el('div', { class: 'game' });
  L.layer.append(game);
  const bmp = scaledCanvas(await loadOriginal(photo), 900);
  const url = bmp.toDataURL('image/jpeg', 0.85);
  const start = (n) => buildPuzzle(game, bmp, url, n, start);
  start(3);
}

function buildPuzzle(game, bmp, url, n, restart) {
  const size = Math.min(innerWidth - 24, innerHeight - 260, 520);
  const sz = size / n;
  let tiles, moves, t0;
  const board = el('div', { class: 'puzzle', style: `width:${size}px;height:${size}px` });
  const scoreEl = el('div', { class: 'score' });
  const sizes = el('div', { class: 'row' }, [3, 4, 5].map((k) => el('button', { class: 'btn small' + (k === n ? ' on' : ''), onclick: () => restart(k) }, `${k}×${k}`)));
  const hint = el('img', { src: url, style: 'width:80px;height:80px;object-fit:cover;border-radius:8px;opacity:.85', title: 'Vorlage' });
  game.replaceChildren(el('div', { class: 'row' }, hint, scoreEl), board, sizes);

  // quadratischer Ausschnitt
  const side = Math.min(bmp.width, bmp.height);
  const ox = (bmp.width - side) / 2, oy = (bmp.height - side) / 2;
  const scale = size / side;

  function draw() {
    board.replaceChildren(...tiles.map((v, pos) => {
      if (v === n * n - 1) return '';
      const cx = v % n, cy = (v / n) | 0;
      const d = el('div', {
        class: 'pc',
        style: `width:${sz}px;height:${sz}px;left:${(pos % n) * sz}px;top:${((pos / n) | 0) * sz}px;background-image:url(${url});` +
          `background-size:${bmp.width * scale}px ${bmp.height * scale}px;background-position:${-(ox * scale + cx * sz)}px ${-(oy * scale + cy * sz)}px`,
      });
      d.onclick = () => move(pos);
      return d;
    }));
    scoreEl.textContent = `${moves} Züge`;
  }
  function neighbors(pos) {
    const x = pos % n, y = (pos / n) | 0;
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => b * n + a);
  }
  function move(pos) {
    const empty = tiles.indexOf(n * n - 1);
    if (!neighbors(empty).includes(pos)) return;
    [tiles[pos], tiles[empty]] = [tiles[empty], tiles[pos]];
    moves++;
    draw();
    if (tiles.every((v, i) => v === i)) {
      const secs = Math.round((Date.now() - t0) / 1000);
      board.replaceChildren(el('img', { src: url, style: `width:100%;height:100%;object-fit:cover` }));
      scoreEl.textContent = `🎉 Geschafft! ${moves} Züge in ${secs} s`;
      confetti();
    }
  }
  // Mischen durch gültige Züge (immer lösbar)
  tiles = [...Array(n * n).keys()];
  let empty = n * n - 1, prev = -1;
  for (let k = 0; k < n * n * 40; k++) {
    const opts = neighbors(empty).filter((p) => p !== prev);
    const p = opts[(Math.random() * opts.length) | 0];
    [tiles[p], tiles[empty]] = [tiles[empty], tiles[p]];
    prev = empty; empty = p;
  }
  moves = 0; t0 = Date.now();
  draw();
}

// ---------- Wer ist das? (Quiz) ----------
export const quiz = {
  name: 'Wer ist das?',
  emoji: '🕵️',
  desc: 'Gesichter erraten – erst verpixelt, dann immer schärfer',
  bg: 'linear-gradient(135deg,#8e2de2,#4a00e0)',
  run() {
    const people = store.peopleList().filter((p) => p.name);
    if (people.length < 2) return toast('Gib mindestens 2 Personen einen Namen (Bereich „Personen“), dann geht das Quiz los!', 4500);
    openQuiz(people);
  },
};

function openQuiz(people) {
  const L = openLayer({ title: 'Wer ist das?', onClose: () => cancelAnimationFrame(raf) });
  const game = el('div', { class: 'game' });
  L.layer.append(game);
  let score = 0, round = 0, raf;
  const canvas = el('canvas', { width: 240, height: 240 });
  const scoreEl = el('div', { class: 'score' });
  const answers = el('div', { class: 'answers' });
  game.append(scoreEl, el('div', { class: 'quiz-face' }, canvas), answers);

  async function next() {
    round++;
    scoreEl.textContent = `Runde ${round} · ${score} Punkte`;
    const person = shuffle(people)[0];
    const face = shuffle(store.facesOfPerson(person.id))[0];
    const img = new Image();
    img.src = blobUrl(face.crop);
    await img.decode();
    const opts = shuffle([person, ...shuffle(people.filter((p) => p.id !== person.id)).slice(0, 3)]);
    const t0 = performance.now();
    let answered = false;
    const ctx = canvas.getContext('2d');
    // Verpixelung wird langsam schärfer – je schneller geraten, desto mehr Punkte
    const draw = (t) => {
      const k = Math.min(1, (t - t0) / 8000);
      const px = answered ? 240 : Math.max(4, Math.round(4 + k * k * 60));
      const tmp = el('canvas', { width: px, height: px });
      tmp.getContext('2d').drawImage(img, 0, 0, px, px);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, 240, 240);
      if (!answered) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    answers.replaceChildren(...opts.map((p) => el('button', {
      class: 'btn',
      onclick: async (e) => {
        if (answered) return;
        answered = true;
        cancelAnimationFrame(raf);
        draw(performance.now());
        const right = p.id === person.id;
        const pts = right ? Math.max(1, Math.round(10 - (performance.now() - t0) / 1000)) : 0;
        score += pts;
        e.currentTarget.classList.add(right ? 'right' : 'wrong');
        [...answers.children].forEach((b, i) => { if (opts[i].id === person.id) b.classList.add('right'); });
        scoreEl.textContent = right ? `✅ +${pts} Punkte! (${score})` : `❌ Das war ${person.name} (${score})`;
        if (right && pts >= 8) confetti(1500);
        await sleep(1600);
        next();
      },
    }, p.name)));
  }
  next();
}

// ---------- Polaroid-Wand ----------
export const polaroid = {
  name: 'Polaroid-Wand',
  emoji: '📌',
  desc: 'Fotos wild an die Pinnwand – zum Verschieben',
  bg: 'linear-gradient(135deg,#8d6e63,#d7a86e)',
  async run() {
    const photos = await pickSource('Welche Fotos an die Wand?');
    if (photos?.length) openWall(photos.slice(0, 30));
  },
};

function openWall(photos) {
  const wall = el('div', { class: 'wall' });
  const L = openLayer({ title: 'Polaroid-Wand', buttons: [el('button', { class: 'icon-btn', title: 'Neu mischen', onclick: () => scatter(true) }, icon('shuffle'))] });
  L.layer.append(wall);
  let z = 1;
  const cards = photos.map((p, i) => {
    const names = [...new Set(store.facesOf(p.id).map((f) => store.personName(f.personId)).filter(Boolean))];
    const card = el('div', { class: 'polaroid' }, el('span', { class: 'pin' }), el('img', { src: blobUrl(p.thumb), alt: '' }),
      el('p', {}, names.join(' & ') || fmtDate(p.date)));
    let drag = null;
    card.addEventListener('pointerdown', (e) => {
      card.setPointerCapture(e.pointerId);
      card.style.zIndex = ++z;
      drag = { x: e.clientX - card.offsetLeft, y: e.clientY - card.offsetTop, sx: e.clientX, sy: e.clientY };
      card.classList.add('drag');
    });
    card.addEventListener('pointermove', (e) => {
      if (!drag) return;
      card.style.left = e.clientX - drag.x + 'px';
      card.style.top = e.clientY - drag.y + 'px';
    });
    card.addEventListener('pointerup', (e) => {
      card.classList.remove('drag');
      if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) openViewer(photos, i);
      drag = null;
    });
    wall.append(card);
    return card;
  });
  function scatter(anim) {
    const W = innerWidth, H = innerHeight;
    const cw = Math.min(170, W * 0.4);
    cards.forEach((c, i) => {
      c.style.width = cw + 'px';
      c.style.transition = anim ? 'left .6s, top .6s, transform .6s' : '';
      c.style.left = Math.random() * (W - cw - 10) + 5 + 'px';
      c.style.top = 60 + Math.random() * Math.max(10, H - cw * 1.3 - 70) + 'px';
      c.style.transform = `rotate(${(Math.random() - 0.5) * 30}deg)`;
      c.style.zIndex = i;
      if (anim) setTimeout(() => { c.style.transition = ''; }, 650);
    });
  }
  scatter(false);
  cards.forEach((c, i) => c.animate([{ transform: 'translateY(-120vh) rotate(40deg)' }, { transform: c.style.transform }], { duration: 600, delay: i * 60, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' }));
}

// ---------- Regenbogen ----------
export const rainbow = {
  name: 'Regenbogen',
  emoji: '🌈',
  desc: 'Alle Fotos nach Farben sortiert',
  bg: 'linear-gradient(135deg,#e53935,#fdd835,#43a047,#1e88e5,#8e24aa)',
  run() {
    const all = [...store.photos.values()];
    const colorful = all.filter((p) => p.sat > 0.12 && p.lig > 0.12 && p.lig < 0.9).sort((a, b) => a.hue - b.hue || b.lig - a.lig);
    const grey = all.filter((p) => !colorful.includes(p)).sort((a, b) => b.lig - a.lig);
    const list = [...colorful, ...grey];
    const L = openLayer({ title: '🌈 Regenbogen' });
    L.layer.append(el('div', { class: 'rainbow' }, list.map((p, i) =>
      el('img', { src: blobUrl(p.thumb), style: `animation-delay:${Math.min(i * 12, 1500)}ms`, onclick: () => openViewer(list, i) }))));
  },
};

// ---------- Doppelgänger ----------
export const lookalike = {
  name: 'Doppelgänger',
  emoji: '👯',
  desc: 'Wer sieht wem am ähnlichsten?',
  bg: 'linear-gradient(135deg,#ec407a,#ab47bc)',
  run() {
    const pairs = lookalikes(10);
    if (!pairs.length) return toast('Dafür braucht es mindestens 2 erkannte Personen');
    const L = openLayer({ title: '👯 Doppelgänger' });
    const face = (p) => {
      const f = store.faces.get(p.coverFaceId) || store.facesOfPerson(p.id)[0];
      return el('img', { src: f ? blobUrl(f.crop) : '', onclick: () => L.close(false, `#/person/${p.id}`), style: 'cursor:pointer' });
    };
    L.layer.append(el('div', { class: 'game', style: 'justify-content:flex-start' },
      el('p', { style: 'color:#ccc;text-align:center;max-width:480px' }, 'Die Gesichtserkennung vergleicht alle Personen – hier sind die ähnlichsten Paare. Rein zum Spaß!'),
      el('div', { class: 'pairs' }, pairs.map((pr, i) => {
        const pct = Math.max(1, Math.round((1 - pr.d / 1.2) * 100));
        return el('div', { class: 'pair', style: `animation: pop .4s ${i * 80}ms backwards` }, face(pr.a),
          el('div', { class: 'vs' }, `${pct} % ähnlich`, el('small', {}, `${pr.a.name || '?'} & ${pr.b.name || '?'}`)), face(pr.b));
      }))));
  },
};

// ---------- Lach-Parade ----------
export const laugh = {
  name: 'Lach-Parade',
  emoji: '😂',
  desc: 'Die fröhlichsten (und überraschtesten) Gesichter',
  bg: 'linear-gradient(135deg,#f12711,#f5af19)',
  run() {
    const faces = [...store.faces.values()];
    if (!faces.length) return toast('Noch keine Gesichter erkannt');
    const L = openLayer({ title: '😂 Lach-Parade' });
    const section = (title, list, label) => list.length > 0 && el('div', { style: 'width:100%;display:flex;flex-direction:column;align-items:center;gap:10px' },
      el('h2', {}, title),
      el('div', { class: 'laugh' }, list.map((f, i) => el('figure', {
        style: `animation: pop .4s ${i * 40}ms backwards`,
        onclick: () => { const p = store.photos.get(f.photoId); if (p) openViewer([p], 0); },
      }, el('img', { src: blobUrl(f.crop) }), el('figcaption', {}, label(f))))));
    const happy = faces.filter((f) => f.happy > 0.5).sort((a, b) => b.happy - a.happy).slice(0, 30);
    const surprised = faces.filter((f) => f.surprised > 0.3).sort((a, b) => b.surprised - a.surprised).slice(0, 20);
    const serious = faces.filter((f) => f.expr === 'neutral' && f.exprScore > 0.9).slice(0, 12);
    L.layer.append(el('div', { class: 'game', style: 'justify-content:flex-start' },
      section('😄 Strahlemänner & -frauen', happy, (f) => `${store.personName(f.personId) || ''} ${Math.round(f.happy * 100)} %`),
      section('😮 Überraschung!', surprised, (f) => store.personName(f.personId) || ''),
      section('😐 Pokerface', serious, (f) => store.personName(f.personId) || ''),
      !happy.length && !surprised.length && el('p', {}, 'Keine Lacher gefunden – zu viele Pokerfaces! 😐')));
  },
};

// ---------- Zeitmaschine ----------
export const timemachine = {
  name: 'Zeitmaschine',
  emoji: '🎰',
  desc: 'Dreh am Rad – oder schüttel das Handy!',
  bg: 'linear-gradient(135deg,#0f2027,#2c5364)',
  run() {
    const all = store.sorted();
    const L = openLayer({ title: '🎰 Zeitmaschine', onClose: () => window.removeEventListener('devicemotion', onShake) });
    const img = el('img', { style: 'width:min(420px,86vw);aspect-ratio:1;object-fit:cover;border-radius:24px;box-shadow:0 20px 60px #000' });
    const label = el('div', { class: 'score', style: 'text-align:center' }, 'Bereit für eine Zeitreise?');
    const btn = el('button', { class: 'btn primary', style: 'font-size:18px;padding:14px 28px' }, icon('dice'), 'Drehen!');
    const open = el('button', { class: 'btn hidden' }, icon('image'), 'Foto öffnen');
    L.layer.append(el('div', { class: 'game' }, img, label, el('div', { class: 'row' }, btn, open)));
    img.src = blobUrl(shuffle(all)[0].thumb);
    let spinning = false, chosen;
    async function spin() {
      if (spinning) return;
      spinning = true;
      open.classList.add('hidden');
      chosen = shuffle(all)[0];
      for (let k = 0; k < 22; k++) {
        img.src = blobUrl(all[(Math.random() * all.length) | 0].thumb);
        label.textContent = String(1990 + ((Math.random() * 40) | 0));
        await sleep(40 + k * k * 0.6);
      }
      img.src = blobUrl(chosen.thumb);
      img.animate([{ transform: 'scale(.8) rotate(-4deg)' }, { transform: 'scale(1.05) rotate(2deg)' }, { transform: 'scale(1)' }], 500);
      const names = [...new Set(store.facesOf(chosen.id).map((f) => store.personName(f.personId)).filter(Boolean))];
      label.textContent = `${relTime(chosen.date)} · ${fmtDate(chosen.date)}${names.length ? ' · ' + names.join(', ') : ''}`;
      open.classList.remove('hidden');
      spinning = false;
    }
    btn.onclick = spin;
    open.onclick = () => openViewer([chosen], 0);
    let last = 0;
    function onShake(e) {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const f = Math.hypot(a.x, a.y, a.z);
      if (f > 25 && Date.now() - last > 1500) { last = Date.now(); spin(); }
    }
    window.addEventListener('devicemotion', onShake);
  },
};
