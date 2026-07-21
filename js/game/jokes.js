/* Star Hopper Lab — per-outcome joke decks.
 * Humor supports the feedback, never interrupts it. Decks are shuffled with
 * a seeded RNG fork (drawing a joke never disturbs the physics stream) and
 * never repeat back-to-back.
 */
(function () {
  'use strict';

  const DECKS = {
    tinyJump: [
      "Hopper hopped a whole... hop.",
      "Small jump for a robot. Big data for science!",
      "The gravel says thanks for visiting.",
      "Engine 1: for when you want to jump, but not, like, a lot.",
    ],
    midJump: [
      "Textbook form! If robots read textbooks.",
      "Smooth flying. Well — smooth falling, technically.",
      "A perfectly reasonable amount of zoom.",
      "Hopper rates that jump: 'pretty okay!'",
    ],
    bigJump: [
      "Hopper achieved orbit. Scientifically interesting!",
      "That jump had its own zip code.",
      "Mission Control called. They're impressed.",
      "The stars waved back.",
    ],
    clamped: [
      "The dial goes up to 10. Hopper checked. Twice.",
      "Nice try! Engine 10 is already maximum zoom.",
      "Safety Officer Hopper: 'ten is plenty.'",
    ],
    montage: [
      "Data buffet: served!",
      "That's what scientists call 'a good haul.'",
      "Jump. Log. Repeat. Beautiful.",
      "The notebook is getting heavy — in a good way.",
    ],
    perfect: [
      "BULLSEYE! The chart knew all along.",
      "Prediction: nailed. Scientist: you.",
      "Dr. Quackers dropped his clipboard.",
    ],
    nearMiss: [
      "Sooo close! The data knows why...",
      "Almost! One more peek at the chart?",
      "Off by a whisker. Science loves a rematch.",
    ],
    bigMiss: [
      "Way off — which is GREAT news: now we get to find out why!",
      "The universe said 'not quite.' Rude, but useful.",
      "Every miss is a clue wearing a disguise.",
    ],
    newBest: [
      "New personal best! Science muscles: growing.",
      "Closer than ever. The chart is proud of you.",
    ],
    publish: [
      "Extra! Extra! Read all about it!",
      "Peer-reviewed and duck-approved.",
      "Your finding is now officially Science™.",
    ],
    pattern: [
      "The dots lined up — hear that click? That's a LAW being discovered.",
      "Same gap every time. That's not luck. That's a rule!",
    ],
  };

  let decks = {};

  function init(rng) {
    const jokeRng = rng.fork('jokes');
    decks = {};
    for (const name in DECKS) {
      decks[name] = { rng: jokeRng.fork(name), order: [], pos: 0, last: null };
    }
  }

  function draw(deckName) {
    const src = DECKS[deckName];
    if (!src) return '';
    const d = decks[deckName] || { rng: null, order: [], pos: 0, last: null };
    if (d.pos >= d.order.length) {
      d.order = d.rng ? d.rng.shuffle(src) : src.slice();
      d.pos = 0;
      // reshuffle must not repeat the previous joke immediately
      if (d.order.length > 1 && d.order[0] === d.last) {
        const t = d.order[0]; d.order[0] = d.order[1]; d.order[1] = t;
      }
    }
    const joke = d.order[d.pos++];
    d.last = joke;
    decks[deckName] = d;
    return joke;
  }

  const IMPACT_WORDS = {
    tiny: ['BOING!', 'plip.', 'HOP!'],
    mid: ['ZOOM!', 'WHOOSH!', 'BOING-G-G!'],
    big: ['KA-ZOOM!', 'MEGA-LEAP!', 'WHOOOOSH!'],
    land: ['THUNK!', 'KA-THUNK!', 'FOOMP!'],
    pattern: ['PATTERN!'],
    star: ['★!'],
  };

  function impactWord(kind) {
    const list = IMPACT_WORDS[kind] || IMPACT_WORDS.mid;
    const d = decks['impact-' + kind] || (decks['impact-' + kind] = {
      rng: (decks.midJump && decks.midJump.rng) ? decks.midJump.rng.fork(kind) : null,
      order: [], pos: 0, last: null,
    });
    if (d.pos >= d.order.length) {
      d.order = d.rng ? d.rng.shuffle(list) : list.slice();
      d.pos = 0;
      if (d.order.length > 1 && d.order[0] === d.last) {
        const t = d.order[0]; d.order[0] = d.order[1]; d.order[1] = t;
      }
    }
    const w = d.order[d.pos++];
    d.last = w;
    return w;
  }

  window.SHL = window.SHL || {};
  window.SHL.jokes = { init, draw, impactWord, DECKS };
})();
