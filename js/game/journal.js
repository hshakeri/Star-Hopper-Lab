/* Star Hopper Lab — The Hopper Journal, peer review, Rule Cards, and the
 * Lab Museum. Publishing turns a notebook page into an article; the trophy
 * for research is the rule itself.
 * Dr. Quackers asks exactly ONE gentle question — replication culture,
 * never a gate.
 */
(function () {
  'use strict';

  const state = {
    refs: null,
    ctx: null,            // current publish context from main
    tiles: [null, null, null],
    quackersShown: false,
    onPublished: null,
  };

  const QUACKERS_CURIOUS = [
    'Quack! Lovely chart. If a friend ran your experiment, would they get the same numbers?',
    'Quack! Does your rule work for engine settings you never tried? Something to wonder about…',
    'Quack! What would engine 0 do? A mystery for another day!',
  ];

  function init(refs, callbacks) {
    state.refs = refs;
    state.onPublished = callbacks.onPublished;
    refs.publishBtn.addEventListener('click', tryPublish);
    refs.moreTrialsBtn.addEventListener('click', () => {
      hideQuackers();
      if (callbacks.onWantMoreTrials) callbacks.onWantMoreTrials();
    });
    refs.publishAnywayBtn.addEventListener('click', () => {
      hideQuackers();
      publishNow();
    });
  }

  /* ctx: { mission, playerName, sol, trials, chartDataURL, fitSlope, rng } */
  function openForMission(ctx) {
    state.ctx = ctx;
    state.quackersShown = false;
    state.tiles = [null, null, null];
    const r = state.refs;
    r.bylineEl.textContent = ctx.playerName;
    r.titleEl.value = r.titleEl.value || 'The Engine Law!';
    r.chartImgEl.src = ctx.chartDataURL;
    r.chartImgEl.alt = 'Your dot plot of ' + ctx.trials.length + ' jumps';
    r.noteEl.value = '';
    hideQuackers();
    renderTiles();
    updatePreview();
  }

  function tileGroups() {
    const slope = window.SHL.chartscale.formatValue(state.ctx.fitSlope);
    return [
      ['Each +1 engine', 'More engine power', 'Changing the engine'],
      ['adds about', 'always adds', 'changes the jump by about'],
      [slope + ' m', 'the same extra distance', slope + ' m — every single time'],
    ];
  }

  function renderTiles() {
    const groups = tileGroups();
    state.refs.tileRows.forEach((rowEl, g) => {
      rowEl.innerHTML = '';
      groups[g].forEach((text, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile' + (state.tiles[g] === i ? ' picked' : '');
        b.textContent = text;
        b.setAttribute('aria-pressed', state.tiles[g] === i ? 'true' : 'false');
        b.addEventListener('click', () => {
          state.tiles[g] = i;
          window.SHL.audio.uiClick();
          renderTiles();
          updatePreview();
        });
        rowEl.appendChild(b);
      });
    });
  }

  function conclusionSentence() {
    const groups = tileGroups();
    if (state.tiles.some((t) => t === null)) return null;
    return state.tiles.map((t, g) => groups[g][t]).join(' ') + '.';
  }

  function updatePreview() {
    const s = conclusionSentence();
    state.refs.previewEl.textContent = s
      ? '“' + s + '”'
      : 'Pick one tile from each row to build your conclusion.';
    state.refs.publishBtn.disabled = !s;
  }

  function tryPublish() {
    const ctx = state.ctx;
    // Evidence before conclusions: one gentle nudge below n=5, never a gate.
    if (ctx.trials.length < 5 && !state.quackersShown) {
      state.quackersShown = true;
      showQuackers('Quack! Nice finding! Would one more trial make you even more sure?');
      return;
    }
    publishNow();
  }

  function publishNow() {
    const ctx = state.ctx;
    const sentence = conclusionSentence();
    if (!sentence) return;
    const article = {
      missionId: ctx.mission.id,
      world: ctx.mission.worldName,
      title: (state.refs.titleEl.value || 'My Discovery').slice(0, 60),
      byline: ctx.playerName,
      sol: ctx.sol,
      n: ctx.trials.length,
      sentence,
      note: (state.refs.noteEl.value || '').slice(0, 120),
      chartDataURL: ctx.chartDataURL,
    };
    // a curious post-publish question when the evidence was already solid
    const quackersLine = ctx.trials.length >= 5
      ? QUACKERS_CURIOUS[Math.floor(ctx.rng.next() * QUACKERS_CURIOUS.length)]
      : null;
    state.onPublished(article, quackersLine);
  }

  function showQuackers(text) {
    state.refs.quackersTextEl.textContent = '🦆 ' + text;
    state.refs.quackersBox.classList.remove('hidden');
    window.SHL.audio.quack();
  }

  function hideQuackers() {
    state.refs.quackersBox.classList.add('hidden');
  }

  // ---------- museum + codex ----------

  function renderMuseum(listEl, articles) {
    if (!articles.length) {
      listEl.innerHTML = '<p class="empty-note">No exhibits yet — publish your first finding in The Hopper Journal!</p>';
      return;
    }
    listEl.innerHTML = '';
    for (const a of articles.slice().reverse()) {
      const card = document.createElement('article');
      card.className = 'exhibit';
      card.innerHTML =
        `<h4>${escapeHtml(a.title)}</h4>` +
        `<p class="exhibit-meta">by ${escapeHtml(a.byline)} · Sol ${a.sol} · ${a.world} · n = ${a.n}</p>` +
        (a.chartDataURL ? `<img src="${a.chartDataURL}" alt="Chart from ${escapeHtml(a.title)}">` : '') +
        `<p class="exhibit-finding">“${escapeHtml(a.sentence)}”</p>` +
        (a.note ? `<p class="exhibit-note">${escapeHtml(a.note)}</p>` : '');
      listEl.appendChild(card);
    }
  }

  function renderCodex(listEl, ruleCards) {
    if (!ruleCards.length) {
      listEl.innerHTML = '<p class="empty-note">Discovered laws will be collected here as Rule Cards.</p>';
      return;
    }
    listEl.innerHTML = '';
    for (const c of ruleCards) {
      const card = document.createElement('div');
      card.className = 'rule-card';
      card.innerHTML =
        `<div class="rule-card-head">📜 ${escapeHtml(c.name)}</div>` +
        `<p>${escapeHtml(c.text)}</p>` +
        (c.chartDataURL ? `<img src="${c.chartDataURL}" alt="The chart that revealed ${escapeHtml(c.name)}">` : '');
      listEl.appendChild(card);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  window.SHL = window.SHL || {};
  window.SHL.journal = { init, openForMission, renderMuseum, renderCodex, showQuackers };
})();
