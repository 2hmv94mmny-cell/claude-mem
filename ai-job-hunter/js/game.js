// Interview Deck: interview prep as a card game.
// One question card at a time. Answer by typing or speaking, then the card
// flips to show stars, what worked, what to fix and a stronger version.
// XP, streaks and a final rank keep it moving.

import { store } from './store.js';
import * as ai from './ai.js';
import { h, toast } from './ui.js';
import { listen, speak, canListen, canSpeak } from './voice.js';
import { inArtifact } from './runtime.js';

const XP_PER_STAR = 20;
const HINT_COST = 10;
const STREAK_BONUS = 10;
const ANSWER_SECONDS = 120;

const RANKS = [
  [0, 'Warming up', 'Every answer you practise now is one you won’t fumble later.'],
  [2.5, 'Getting there', 'Good bones. Tighten the stories and add a result to each.'],
  [3.5, 'Interview ready', 'You can walk in tomorrow. Polish the weaker cards and go.'],
  [4.4, 'Offer magnet', 'Strong, specific answers across the board. Go get it.'],
];

const CAT_CLASS = {
  'Story time': 'cat-story',
  'Skills check': 'cat-skills',
  Motivation: 'cat-motivation',
  'Company fit': 'cat-fit',
  Curveball: 'cat-curve',
};

const prefs = {
  get readAloud() {
    try {
      return localStorage.getItem('ajh:readAloud') === '1';
    } catch {
      return false;
    }
  },
  set readAloud(v) {
    try {
      localStorage.setItem('ajh:readAloud', v ? '1' : '0');
    } catch {}
  },
};

const MIC_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';

// ---------------------------------------------------------------------
// Game feel: sound, haptics, confetti, flying XP, levels and daily streak.
// Short, quiet and optional, like the feedback in the best mobile games.
// ---------------------------------------------------------------------
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const soundOn = {
  get on() {
    try {
      return localStorage.getItem('ajh:gameSound') !== '0';
    } catch {
      return true;
    }
  },
  set on(v) {
    try {
      localStorage.setItem('ajh:gameSound', v ? '1' : '0');
    } catch {}
  },
};
let audio = null;
function tone(freq, { at = 0, dur = 0.12, type = 'sine', vol = 0.05 } = {}) {
  if (!soundOn.on) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime + at;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}
const sfx = {
  deal: () => tone(330, { dur: 0.08, type: 'triangle', vol: 0.035 }),
  flip: () => (tone(520, { dur: 0.08, type: 'triangle', vol: 0.03 }), tone(780, { at: 0.06, dur: 0.1, type: 'triangle', vol: 0.03 })),
  star: (i) => tone(523.25 * Math.pow(2, (i * 2) / 12), { at: 0.12 + i * 0.09, dur: 0.16, type: 'sine', vol: 0.045 }),
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.28, type: 'triangle', vol: 0.04 })),
  soft: () => tone(392, { dur: 0.18, type: 'sine', vol: 0.03 }),
  tap: () => tone(660, { dur: 0.05, type: 'square', vol: 0.012 }),
};
const buzz = (pattern) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
};

/** A burst of confetti from an element (skipped with reduced motion). */
function confetti(from, count = 36) {
  if (reduceMotion() || !from?.isConnected) return;
  const r = from.getBoundingClientRect();
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  const colors = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#06b6d4'];
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const d = 90 + Math.random() * 160;
    layer.append(
      h('i', {
        style: `left:${r.left + r.width / 2}px;top:${r.top + r.height / 3}px;--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 80}px;--r:${Math.random() * 720 - 360}deg;--c:${colors[i % colors.length]};--d:${Math.random() * 120}ms;--s:${0.6 + Math.random() * 0.8}`,
      }),
    );
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1600);
}

/** "+60 XP" flies from the card to the XP counter, which then counts up. */
function flyXP(from, to, amount, onLand) {
  if (!from || !to || reduceMotion() || !amount) return onLand?.();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const chip = h('span', { class: 'xp-fly', style: `left:${a.left + a.width / 2}px;top:${a.top + a.height / 2}px` }, `+${amount} XP`);
  document.body.append(chip);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = chip.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, -90%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, opacity: 0.9 },
    ],
    { duration: 900, easing: 'cubic-bezier(.5, 0, .2, 1)' },
  );
  anim.onfinish = () => {
    chip.remove();
    to.classList.remove('bump');
    void to.offsetWidth;
    to.classList.add('bump');
    onLand?.();
  };
}

/** Count a number up in an element. */
function countUp(el, from, to, ms = 700) {
  if (!el) return;
  if (reduceMotion() || from === to) return void (el.textContent = `${to} XP`);
  const t0 = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = `${Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))} XP`;
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Level from all the XP earned across every job's deck.
function totalXP() {
  return Object.values(store.get().prep || {}).reduce((sum, p) => sum + Math.max(p?.best || 0, p?.xp || 0), 0);
}
function levelOf(xp) {
  let level = 1;
  let need = 100;
  let floor = 0;
  while (xp >= floor + need) {
    floor += need;
    level++;
    need = Math.round(need * 1.35);
  }
  return { level, into: xp - floor, need };
}

// Days in a row you practised (any job).
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
function practiseDays() {
  try {
    return JSON.parse(localStorage.getItem('ajh:gameDays') || '[]');
  } catch {
    return [];
  }
}
function markPractised() {
  const days = new Set(practiseDays());
  days.add(dayKey());
  try {
    localStorage.setItem('ajh:gameDays', JSON.stringify([...days].slice(-60)));
  } catch {}
}
function dayStreak() {
  const days = new Set(practiseDays());
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not played yet: yesterday still counts
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

const SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

function icon(svg) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = svg; // static markup defined above
  return span;
}

/**
 * Mount the game into `root` for one job.
 * @param {HTMLElement} root
 * @param {object} job
 * @param {{ensureSaved: () => void}} opts
 */
export function renderInterviewGame(root, job, { ensureSaved }) {
  const id = job.id;
  let ctl = null; // AbortController for the current AI call
  let mic = null; // active speech recognition
  let timer = null;
  let stopSpeech = () => {};

  const state = () => store.get().prep[id] || {};
  const save = (patch) => {
    ensureSaved();
    store.update((s) => (s.prep[id] = { ...s.prep[id], ...patch }));
  };

  function cleanup() {
    ctl?.abort();
    mic?.stop();
    mic = null;
    clearInterval(timer);
    stopSpeech();
  }

  // Stop everything when the game leaves the page.
  const watcher = new MutationObserver(() => {
    if (!root.isConnected) {
      cleanup();
      watcher.disconnect();
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });

  function draw() {
    cleanup();
    const st = state();
    const deck = st.deck?.cards?.length ? st.deck : null;
    if (!deck) return drawLobby();
    if ((st.index ?? 0) >= deck.cards.length) return drawEnd();
    drawCard();
  }

  // ---------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------
  function drawLobby(error) {
    const st = state();
    const deal = h('button', { class: 'btn primary big gl-deal', type: 'button' }, 'Deal the cards');
    const status = h('p', { class: 'muted small', role: 'status' }, error || '');
    deal.addEventListener('click', () => newDeck(deal, status));
    const cats = Object.keys(CAT_CLASS);
    const lv = levelOf(totalXP());
    const days = dayStreak();
    root.replaceChildren(
      h(
        'section',
        { class: 'game-lobby gl' },
        h(
          'div',
          { class: 'gl-stage', 'aria-hidden': 'true' },
          h('span', { class: 'gl-glow' }),
          ...cats.map((c, i) => h('span', { class: `gl-card ${CAT_CLASS[c]}`, style: `--i:${i - 2}` }, h('span', { class: 'gl-card-cat' }, c), h('span', { class: 'gl-card-q' }), h('span', { class: 'gl-card-q short' }))),
        ),
        h(
          'div',
          { class: 'gl-player' },
          h('span', { class: 'gl-level', title: `Level ${lv.level}` }, h('strong', {}, String(lv.level)), h('span', {}, 'Level')),
          h('div', { class: 'gl-lvbar' }, h('div', { class: 'gl-lvtrack' }, h('span', { style: `width:${Math.round((lv.into / lv.need) * 100)}%` })), h('small', {}, `${lv.into} / ${lv.need} XP to level ${lv.level + 1}`)),
          h('span', { class: `gl-days${days ? ' on' : ''}`, title: 'Days in a row' }, '🔥', h('strong', {}, String(days)), h('span', {}, days === 1 ? 'day' : 'days')),
        ),
        h('p', { class: 'gl-eyebrow' }, [job.company, job.title].filter(Boolean).join(' · ')),
        h('h2', {}, 'Interview Deck'),
        h('p', { class: 'gl-lead' }, 'Eight question cards written for this exact job. Answer out loud or type, and every answer comes back with stars, what worked, and a stronger version.'),
        h(
          'div',
          { class: 'gl-stats' },
          h('div', {}, h('strong', {}, '8'), h('span', {}, 'cards')),
          h('div', {}, h('strong', {}, '~10'), h('span', {}, 'minutes')),
          h('div', {}, h('strong', {}, st.best ? String(st.best) : '–'), h('span', {}, 'best XP')),
        ),
        h('div', { class: 'gl-cats' }, ...cats.map((c) => h('span', { class: `cat ${CAT_CLASS[c]}` }, c))),
        deal,
        status,
        h(
          'ul',
          { class: 'lobby-rules gl-rules' },
          h('li', {}, h('strong', {}, `${XP_PER_STAR} XP`), ' per star'),
          h('li', {}, h('strong', {}, `+${STREAK_BONUS} XP`), ' streak bonus'),
          h('li', {}, h('strong', {}, `−${HINT_COST} XP`), ' for a hint'),
        ),
      ),
    );
  }

  async function newDeck(btn, status) {
    if (!ai.hasKey()) {
      toast('Allow Claude for this page, or add an API key in Settings.');
      return;
    }
    ctl = new AbortController();
    btn.disabled = true;
    btn.textContent = 'Shuffling…';
    status.textContent = 'Claude is writing questions for this job. About 20 seconds.';
    try {
      const deck = await ai.interviewDeck(job, { signal: ctl.signal });
      if (!deck.cards.length) throw new Error('No questions came back. Try again.');
      save({ deck, index: 0, results: [], xp: 0, streak: 0 });
      draw();
    } catch (err) {
      if (ctl?.signal.aborted) return;
      btn.disabled = false;
      btn.textContent = 'Deal the cards';
      status.textContent = err.message;
    }
  }

  // ---------------------------------------------------------------------
  // Card
  // ---------------------------------------------------------------------
  function hud() {
    const st = state();
    const total = st.deck.cards.length;
    return h(
      'div',
      { class: 'hud' },
      h(
        'div',
        { class: 'pips', 'aria-label': `Card ${Math.min(st.index + 1, total)} of ${total}` },
        ...st.deck.cards.map((_, i) => {
          const r = st.results?.[i];
          return h('span', { class: `pip ${i === st.index ? 'now' : ''} ${r ? `done s${r.stars}` : ''}` });
        }),
      ),
      h('div', { class: 'hud-stats' }, h('span', { class: 'hud-count' }, `Card ${Math.min(st.index + 1, total)} of ${total}`), st.streak >= 2 ? h('span', { class: 'streak' }, `🔥 ×${st.streak}`) : '', h('span', { class: 'xp' }, `${st.xp || 0} XP`), soundButton()),
    );
  }
  function soundButton() {
    const b = h('button', { type: 'button', class: 'icon-btn hud-sound', 'aria-pressed': String(soundOn.on), 'aria-label': soundOn.on ? 'Sound on' : 'Sound off', title: soundOn.on ? 'Sound on' : 'Sound off' }, icon(soundOn.on ? SOUND_ON : SOUND_OFF));
    b.addEventListener('click', () => {
      soundOn.on = !soundOn.on;
      b.replaceWith(soundButton());
      sfx.tap();
    });
    return b;
  }

  function drawCard() {
    const st = state();
    const card = st.deck.cards[st.index];
    const usedHint = Boolean(st.hintShown);

    // Front of the card
    const speakBtn = canSpeak ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Read the question aloud', title: 'Read aloud' }, icon(SPEAKER_ICON)) : '';
    if (speakBtn) speakBtn.addEventListener('click', () => (stopSpeech = speak(card.question)));

    const hintBox = h('p', { class: 'hint', hidden: !usedHint }, card.hint);
    const hintBtn = h('button', { class: 'chip', type: 'button', hidden: usedHint || !card.hint }, `Hint (−${HINT_COST} XP)`);
    hintBtn.addEventListener('click', () => {
      save({ hintShown: true });
      hintBox.hidden = false;
      hintBtn.hidden = true;
    });

    const front = h(
      'div',
      { class: 'card-face front' },
      h('div', { class: 'card-top' }, h('span', { class: `cat ${CAT_CLASS[card.category] || ''}` }, card.category), h('span', { class: 'diff', 'aria-label': `Difficulty ${card.difficulty} of 3` }, '●'.repeat(card.difficulty) + '○'.repeat(3 - card.difficulty)), speakBtn),
      h('p', { class: 'question' }, card.question),
      card.testing ? h('p', { class: 'testing' }, `They want to know: ${card.testing}`) : '',
      h('div', { class: 'card-foot' }, hintBtn),
      hintBox,
    );
    const back = h('div', { class: 'card-face back', 'aria-live': 'polite' });
    const flip = h('div', { class: 'flip' }, front, back);
    const left = st.deck.cards.length - st.index - 1;
    const cardEl = h('div', { class: 'qcard deal-in', 'data-n': `${st.index + 1}/${st.deck.cards.length}` }, h('div', { class: `deck-stack l${Math.min(3, left)}`, 'aria-hidden': 'true' }), flip);
    sfx.deal();
    // A gentle 3D tilt that follows the pointer (mouse and pen only).
    cardEl.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || reduceMotion() || flip.classList.contains('flipped')) return;
      const r = cardEl.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cardEl.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
      cardEl.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
      cardEl.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
      cardEl.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
    });
    cardEl.addEventListener('pointerleave', () => {
      cardEl.style.setProperty('--rx', '0deg');
      cardEl.style.setProperty('--ry', '0deg');
    });

    // Answer area
    const answer = h('textarea', { id: 'game-answer', rows: 5, placeholder: 'Say it like you would in the room. Type, or tap the mic.' }, st.draft || '');
    // How long the answer is, as a friendly meter: interviewers like 1 to 2 minutes.
    const meterFill = h('span');
    const meterText = h('span', { class: 'len-text' });
    const meter = h('div', { class: 'len-meter', 'aria-live': 'polite' }, h('div', { class: 'len-track' }, meterFill), meterText);
    const paintMeter = () => {
      const n = (answer.value.trim().match(/\S+/g) || []).length;
      const [cls, label] = n < 25 ? ['short', n ? 'Keep going' : 'Start with the situation'] : n < 60 ? ['mid', 'Add the result'] : n <= 220 ? ['good', 'Great length'] : ['long', 'A bit long: tighten it'];
      meter.className = `len-meter ${cls}`;
      meterFill.style.width = `${Math.min(100, (n / 160) * 100)}%`;
      meterText.textContent = `${n} ${n === 1 ? 'word' : 'words'} · ${label}`;
    };
    paintMeter();
    answer.addEventListener('input', () => {
      save({ draft: answer.value });
      paintMeter();
    });
    const micBtn = h('button', { class: 'mic-btn', type: 'button', 'aria-label': 'Answer with your voice' }, icon(MIC_ICON), h('span', {}, 'Speak'));
    const voiceNote = h('p', { class: 'muted small voice-note', hidden: true });
    micBtn.addEventListener('click', () => toggleMic(micBtn, answer, voiceNote));

    const bar = h('div', { class: 'timebar' }, h('span'));
    const clock = h('span', { class: 'clock' }, '2:00');
    const lockIn = h('button', { class: 'btn primary', type: 'button' }, 'Lock in answer');
    const skip = h('button', { class: 'btn', type: 'button' }, 'Skip');
    const status = h('p', { class: 'small error', role: 'status' });

    lockIn.addEventListener('click', () => submit());
    skip.addEventListener('click', () => {
      record({ stars: 0, skipped: true, verdict: 'Skipped', good: '', improve: '', stronger: '', xp: 0 }, '');
      next();
    });
    answer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    });

    const answerZone = h(
      'div',
      { class: 'answer-zone' },
      h('div', { class: 'time-row' }, bar, clock),
      answer,
      meter,
      voiceNote,
      h('div', { class: 'row wrap answer-actions' }, micBtn, h('span', { class: 'spacer' }), skip, h('span', { class: 'lock-wrap' }, lockIn, h('kbd', { class: 'kbd-hint', 'aria-hidden': 'true' }, navigator.platform?.includes('Mac') ? '⌘ ↵' : 'Ctrl ↵'))),
      status,
    );

    const readToggle = canSpeak ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: prefs.readAloud }), 'Read questions aloud') : '';
    if (readToggle) readToggle.querySelector('input').addEventListener('change', (e) => (prefs.readAloud = e.target.checked));

    root.replaceChildren(h('section', { class: 'game' }, hud(), cardEl, answerZone, h('div', { class: 'row space game-foot' }, readToggle, quitButton())));

    // Soft timer: a nudge, never a hard stop.
    const started = Date.now();
    timer = setInterval(() => {
      const left = Math.max(0, ANSWER_SECONDS - Math.floor((Date.now() - started) / 1000));
      clock.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Wrap it up';
      bar.firstChild.style.width = `${(left / ANSWER_SECONDS) * 100}%`;
      bar.classList.toggle('low', left <= 30);
      if (!left) clearInterval(timer);
    }, 500);

    if (prefs.readAloud) stopSpeech = speak(card.question);

    async function submit() {
      const text = answer.value.trim();
      if (text.split(/\s+/).length < 4) {
        status.textContent = 'Give it a proper go first, even a few sentences.';
        answer.focus();
        return;
      }
      mic?.stop();
      clearInterval(timer);
      stopSpeech();
      status.textContent = '';
      lockIn.disabled = skip.disabled = micBtn.disabled = answer.disabled = true;
      lockIn.textContent = 'Judging…';
      cardEl.classList.add('judging');
      back.replaceChildren(h('div', { class: 'judge-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
      front.append(h('p', { class: 'judging-note', role: 'status' }, 'Vora is reading your answer…'));
      ctl = new AbortController();
      try {
        const res = await ai.scoreAnswer(job, card, text, { signal: ctl.signal });
        const prevStreak = state().streak || 0;
        const streak = res.stars >= 4 ? prevStreak + 1 : 0;
        const xp = res.stars * XP_PER_STAR - (state().hintShown ? HINT_COST : 0) + (streak >= 2 ? STREAK_BONUS : 0);
        const before = state().xp || 0;
        record({ ...res, xp: Math.max(0, xp), hint: Boolean(state().hintShown), seconds: Math.round((Date.now() - started) / 1000) }, text, streak);
        markPractised();
        cardEl.classList.remove('judging');
        front.querySelector('.judging-note')?.remove();
        showResult(back, flip, res, Math.max(0, xp), streak);
        answerZone.replaceChildren(resultActions());
        const newHud = hud();
        const xpEl = newHud.querySelector('.xp');
        xpEl.textContent = `${before} XP`;
        root.querySelector('.hud')?.replaceWith(newHud);
        setTimeout(() => flyXP(back.querySelector('.xp-gain'), xpEl, Math.max(0, xp), () => countUp(xpEl, before, state().xp || 0)), 650);
        if (res.stars >= 4) {
          setTimeout(() => confetti(cardEl, res.stars === 5 ? 48 : 28), 520);
          buzz(res.stars === 5 ? [18, 40, 18, 40, 30] : [20, 50, 20]);
        } else if (res.stars <= 2) {
          buzz(12);
        }
      } catch (err) {
        cardEl.classList.remove('judging');
        lockIn.disabled = skip.disabled = micBtn.disabled = answer.disabled = false;
        lockIn.textContent = 'Lock in answer';
        if (!ctl.signal.aborted) status.textContent = err.message;
      }
    }
  }

  function toggleMic(btn, answer, note) {
    if (mic) {
      mic.stop();
      return;
    }
    btn.classList.add('live');
    btn.querySelector('span:last-child').textContent = 'Listening… tap to stop';
    note.hidden = true;
    mic = listen({
      base: answer.value,
      onText: (t) => {
        answer.value = t;
        answer.dispatchEvent(new Event('input')); // saves the draft and updates the length meter
      },
      onEnd: (reason) => {
        mic = null;
        btn.classList.remove('live');
        btn.querySelector('span:last-child').textContent = 'Speak';
        if (reason === 'blocked' || reason === 'unsupported') {
          note.hidden = false;
          note.textContent = inArtifact || !canListen
            ? 'Voice input isn’t available on this page. Tap the box and use the microphone key on your keyboard to dictate your answer.'
            : 'The microphone is blocked. Allow it in your browser, or use the microphone key on your keyboard to dictate.';
          answer.focus();
        } else if (reason === 'error') {
          note.hidden = false;
          note.textContent = 'Didn’t catch that. Tap Speak to try again.';
        }
      },
    });
  }

  function record(result, answerText, streak = 0) {
    const st = state();
    const results = [...(st.results || [])];
    results[st.index] = { ...result, answer: answerText };
    const xp = results.reduce((sum, r) => sum + (r?.xp || 0), 0);
    save({ results, xp, streak, draft: '', hintShown: false });
  }

  function showResult(back, flip, res, xp, streak) {
    sfx.flip();
    for (let i = 0; i < res.stars; i++) sfx.star(i);
    if (res.stars <= 2) setTimeout(sfx.soft, 200);
    back.classList.remove('tier-low', 'tier-mid', 'tier-high');
    back.classList.add(res.stars >= 4 ? 'tier-high' : res.stars >= 3 ? 'tier-mid' : 'tier-low');
    const stars = h(
      'div',
      { class: 'stars', 'aria-label': `${res.stars} out of 5 stars` },
      ...Array.from({ length: 5 }, (_, i) => h('span', { class: i < res.stars ? 'on' : '', style: `--d:${i * 90}ms` }, '★')),
    );
    const strongerBtn = canSpeak ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Read the stronger answer aloud' }, icon(SPEAKER_ICON)) : '';
    if (strongerBtn) strongerBtn.addEventListener('click', () => (stopSpeech = speak(res.stronger)));
    back.replaceChildren(
      stars,
      h('p', { class: 'verdict' }, res.verdict || ['Keep going', 'Getting there', 'Nice', 'Strong answer', 'Nailed it'][res.stars - 1]),
      res.stars <= 2 ? h('p', { class: 'kind small' }, 'Every pro starts here. Read the stronger answer, then try this card again.') : '',
      h('p', { class: 'xp-gain' }, `+${xp} XP`, streak >= 2 ? h('span', { class: 'streak' }, ` Streak ×${streak}`) : ''),
      res.good ? h('div', { class: 'fb good' }, h('strong', {}, 'Worked'), h('p', {}, res.good)) : '',
      res.improve ? h('div', { class: 'fb fix' }, h('strong', {}, 'Next time'), h('p', {}, res.improve)) : '',
      res.stronger ? h('details', { class: 'stronger' }, h('summary', {}, 'Hear a stronger answer'), h('div', { class: 'row' }, h('p', {}, res.stronger), strongerBtn)) : '',
    );
    requestAnimationFrame(() => flip.classList.add('flipped'));
  }

  function resultActions() {
    const st = state();
    const last = st.index >= st.deck.cards.length - 1;
    const again = h('button', { class: 'btn', type: 'button' }, 'Try this card again');
    again.addEventListener('click', () => {
      const results = [...st.results];
      results[st.index] = undefined;
      save({ results, xp: results.reduce((s, r) => s + (r?.xp || 0), 0) });
      draw();
    });
    const nextBtn = h('button', { class: 'btn primary', type: 'button' }, last ? 'See my results' : 'Next card');
    nextBtn.addEventListener('click', next);
    setTimeout(() => nextBtn.focus(), 400);
    return h('div', { class: 'row wrap result-actions' }, again, h('span', { class: 'spacer' }), nextBtn);
  }

  function next() {
    save({ index: (state().index || 0) + 1, hintShown: false, draft: '' });
    draw();
  }

  function quitButton() {
    const b = h('button', { class: 'link-btn small', type: 'button' }, 'Finish early');
    b.addEventListener('click', () => {
      save({ index: state().deck.cards.length });
      draw();
    });
    return b;
  }

  // ---------------------------------------------------------------------
  // End screen
  // ---------------------------------------------------------------------
  function drawEnd() {
    const st = state();
    const cards = st.deck.cards;
    const results = st.results || [];
    const played = results.filter((r) => r && !r.skipped);
    const avg = played.length ? played.reduce((s, r) => s + r.stars, 0) / played.length : 0;
    const [, rank, blurb] = [...RANKS].reverse().find(([min]) => avg >= min) || RANKS[0];
    const xp = st.xp || 0;
    const levelBefore = levelOf(totalXP());
    const newBest = xp > (st.best || 0);
    if (newBest) save({ best: xp });
    const levelAfter = levelOf(totalXP());
    // Badges for this run.
    let run = 0;
    let bestRun = 0;
    for (const r of results) {
      run = r && !r.skipped && r.stars >= 4 ? run + 1 : 0;
      bestRun = Math.max(bestRun, run);
    }
    const BADGES = [
      ['perfect', '⭐', 'Perfect card', 'A five star answer', results.some((r) => r && r.stars === 5)],
      ['streak', '🔥', 'Hot streak', 'Three strong answers in a row', bestRun >= 3],
      ['nohint', '🧠', 'No help needed', 'Every card without a hint', played.length === cards.length && results.every((r) => r && !r.hint)],
      ['quick', '⚡', 'Quick thinker', 'A 4 star answer in under a minute', results.some((r) => r && r.stars >= 4 && r.seconds && r.seconds < 60)],
      ['finisher', '🏁', 'Full deck', 'Answered every card', played.length === cards.length],
    ];
    const earned = BADGES.filter((b) => b[4]);

    // Average stars per category
    const byCat = new Map();
    cards.forEach((c, i) => {
      const r = results[i];
      if (!r || r.skipped) return;
      const e = byCat.get(c.category) || { sum: 0, n: 0 };
      e.sum += r.stars;
      e.n += 1;
      byCat.set(c.category, e);
    });

    const weak = cards.map((c, i) => [c, results[i]]).filter(([, r]) => !r || r.skipped || r.stars <= 3);

    const review = h('div', { class: 'review' });
    const minis = h(
      'div',
      { class: 'minis' },
      ...cards.map((c, i) => {
        const r = results[i];
        const b = h(
          'button',
          { type: 'button', class: `mini ${CAT_CLASS[c.category] || ''}` },
          h('span', { class: 'mini-stars' }, r && !r.skipped ? '★'.repeat(r.stars) : r?.skipped ? 'Skipped' : '—'),
          h('span', { class: 'mini-q' }, c.question),
        );
        b.addEventListener('click', () => {
          for (const m of minis.children) m.classList.remove('sel');
          b.classList.add('sel');
          review.replaceChildren(
            h('h3', {}, c.question),
            r?.answer ? h('div', { class: 'fb' }, h('strong', {}, 'You said'), h('p', {}, r.answer)) : h('p', { class: 'muted' }, 'Not answered.'),
            r?.improve ? h('div', { class: 'fb fix' }, h('strong', {}, 'Next time'), h('p', {}, r.improve)) : '',
            r?.stronger ? h('div', { class: 'fb good' }, h('strong', {}, 'Stronger answer'), h('p', {}, r.stronger)) : '',
          );
        });
        return b;
      }),
    );

    const retry = h('button', { class: 'btn primary', type: 'button', hidden: !weak.length }, `Replay ${weak.length} weaker card${weak.length === 1 ? '' : 's'}`);
    retry.addEventListener('click', () => {
      save({ deck: { ...st.deck, cards: weak.map(([c]) => c) }, index: 0, results: [], xp: 0, streak: 0 });
      draw();
    });
    const fresh = h('button', { class: 'btn', type: 'button' }, 'New deck');
    const status = h('p', { class: 'muted small', role: 'status' });
    fresh.addEventListener('click', () => newDeck(fresh, status));

    root.replaceChildren(
      h(
        'section',
        { class: 'game-end' },
        h(
          'div',
          { class: 'rank-card' },
          h('p', { class: 'rank-label' }, newBest ? 'New best run · Your rank' : 'Your rank'),
          h('h2', {}, rank),
          h('div', { class: 'rank-stars', 'aria-label': `${avg.toFixed(1)} of 5 stars on average` }, ...Array.from({ length: 5 }, (_, i) => h('span', { class: i < Math.round(avg) ? 'on' : '', style: `--d:${300 + i * 110}ms` }, '★'))),
          h('p', {}, blurb),
          h('div', { class: 'rank-stats' }, h('div', {}, h('strong', { class: 'count-up', 'data-to': String(xp) }, '0'), h('span', {}, 'XP')), h('div', {}, h('strong', {}, avg ? avg.toFixed(1) : '0'), h('span', {}, 'avg stars')), h('div', {}, h('strong', {}, `${played.length}/${cards.length}`), h('span', {}, 'answered'))),
        ),
        byCat.size
          ? h(
              'div',
              { class: 'cat-bars' },
              ...[...byCat].map(([cat, e]) =>
                h('div', { class: 'cat-bar' }, h('span', { class: `cat ${CAT_CLASS[cat] || ''}` }, cat), h('div', { class: 'bar' }, h('span', { style: `width:${(e.sum / e.n / 5) * 100}%` })), h('span', { class: 'small' }, (e.sum / e.n).toFixed(1))),
              ),
            )
          : '',
        h(
          'div',
          { class: 'level-card' },
          h('span', { class: 'gl-level' }, h('strong', {}, String(levelAfter.level)), h('span', {}, 'Level')),
          h('div', { class: 'gl-lvbar' }, h('div', { class: 'gl-lvtrack' }, h('span', { class: 'grow', style: `--from:${Math.round((levelBefore.into / levelBefore.need) * 100)}%;width:${Math.round((levelAfter.into / levelAfter.need) * 100)}%` })), h('small', {}, levelAfter.level > levelBefore.level ? `Level up! Now level ${levelAfter.level}` : `${levelAfter.into} / ${levelAfter.need} XP to level ${levelAfter.level + 1}`)),
          h('span', { class: 'gl-days on' }, '🔥', h('strong', {}, String(dayStreak())), h('span', {}, dayStreak() === 1 ? 'day' : 'days')),
        ),
        earned.length
          ? h('div', { class: 'badges' }, ...earned.map(([k, emoji, title, text], i) => h('div', { class: `badge-card b-${k}`, style: `--d:${600 + i * 140}ms` }, h('span', { class: 'badge-emoji', 'aria-hidden': 'true' }, emoji), h('strong', {}, title), h('small', {}, text))))
          : '',
        h('h3', {}, 'Your cards'),
        h('p', { class: 'muted small' }, 'Tap a card to see your answer and a stronger version.'),
        minis,
        review,
        st.deck.askThem?.length
          ? h('div', { class: 'bonus-card' }, h('p', { class: 'rank-label' }, 'Bonus card'), h('h3', {}, 'Questions to ask them'), h('ul', {}, ...st.deck.askThem.map((q) => h('li', {}, q))))
          : '',
        h('div', { class: 'row wrap' }, retry, fresh),
        status,
      ),
    );
    // Celebrate a good run.
    if (avg >= 3.5 || newBest) {
      setTimeout(() => {
        sfx.win();
        confetti(root.querySelector('.rank-card'), 56);
        buzz([20, 60, 20, 60, 40]);
      }, 350);
    }
    // XP counts up, like a score screen.
    const el = root.querySelector('.count-up');
    if (el) {
      const to = Number(el.dataset.to) || 0;
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 900);
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1 && el.isConnected) requestAnimationFrame(tick);
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) el.textContent = String(to);
      else requestAnimationFrame(tick);
    }
  }

  draw();
}
