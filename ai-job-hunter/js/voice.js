// Voice for the interview game.
//
// Speaking answers: the browser's speech recognition, where the page is
// allowed to use the microphone (the standalone website in Chrome, Edge and
// Safari). Inside the claude.ai viewer the microphone is not available to
// pages, so the caller falls back to the phone keyboard's own dictation key,
// which works in any text box.
//
// Hearing questions: speech synthesis needs no permission.
import { locale } from './i18n.js';

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const canListen = Boolean(Recognition);
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Start listening. Calls `onText(fullTranscript)` as words arrive and
 * `onEnd(reason)` once, where reason is 'stopped' | 'blocked' | 'unsupported' | 'error'.
 * @returns {{stop: () => void}}
 */
export function listen({ base = '', onText, onEnd }) {
  if (!Recognition) {
    queueMicrotask(() => onEnd('unsupported'));
    return { stop() {} };
  }
  let rec;
  try {
    rec = new Recognition();
  } catch {
    queueMicrotask(() => onEnd('unsupported'));
    return { stop() {} };
  }
  rec.lang = locale();
  rec.continuous = true;
  rec.interimResults = true;

  let finalText = base ? base.trimEnd() + ' ' : '';
  let ended = false;
  const finish = (reason) => {
    if (ended) return;
    ended = true;
    onEnd(reason);
  };

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
      else interim += r[0].transcript;
    }
    onText((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const blocked = ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error);
    finish(blocked ? 'blocked' : e.error === 'aborted' || e.error === 'no-speech' ? 'stopped' : 'error');
  };
  rec.onend = () => finish('stopped');

  try {
    rec.start();
  } catch {
    queueMicrotask(() => finish('blocked'));
  }
  return {
    stop() {
      try {
        rec.stop();
      } catch {}
    },
  };
}

/** Read text aloud. Returns a function that stops it. */
export function speak(text) {
  if (!canSpeak) return () => {};
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale();
    u.rate = 1;
    speechSynthesis.speak(u);
  } catch {}
  return () => {
    try {
      speechSynthesis.cancel();
    } catch {}
  };
}
