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
      h('div', { class: 'hud-stats' }, h('span', { class: 'hud-count' }, `Card ${Math.min(st.index + 1, total)} of ${total}`), st.streak >= 2 ? h('span', { class: 'streak' }, `🔥 ×${st.streak}`) : '', h('span', { class: 'xp' }, `${st.xp || 0} XP`)),
    );
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
    const cardEl = h('div', { class: 'qcard deal-in', 'data-n': `${st.index + 1}/${st.deck.cards.length}` }, flip);

    // Answer area
    const answer = h('textarea', { id: 'game-answer', rows: 5, placeholder: 'Say it like you would in the room. Type, or tap the mic.' }, st.draft || '');
    answer.addEventListener('input', () => save({ draft: answer.value }));
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
      voiceNote,
      h('div', { class: 'row wrap answer-actions' }, micBtn, h('span', { class: 'spacer' }), skip, lockIn),
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
      ctl = new AbortController();
      try {
        const res = await ai.scoreAnswer(job, card, text, { signal: ctl.signal });
        const prevStreak = state().streak || 0;
        const streak = res.stars >= 4 ? prevStreak + 1 : 0;
        const xp = res.stars * XP_PER_STAR - (state().hintShown ? HINT_COST : 0) + (streak >= 2 ? STREAK_BONUS : 0);
        record({ ...res, xp: Math.max(0, xp), hint: Boolean(state().hintShown) }, text, streak);
        cardEl.classList.remove('judging');
        showResult(back, flip, res, Math.max(0, xp), streak);
        answerZone.replaceChildren(resultActions());
        root.querySelector('.hud')?.replaceWith(hud());
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
        save({ draft: t });
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
    if (xp > (st.best || 0)) save({ best: xp });

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
          h('p', { class: 'rank-label' }, 'Your rank'),
          h('h2', {}, rank),
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
