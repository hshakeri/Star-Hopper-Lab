/* Star Hopper Lab — main conductor.
 * Wires the world, notebook, console, and journal into the research loop:
 * Question → Collect → Chart → Predict → Test → Publish.
 */
(function () {
  'use strict';

  const S = window.SHL;
  const $ = (id) => document.getElementById(id);

  // ---------- app state ----------

  let saveState = S.save.load();
  let rng = S.rng.makeRNG(saveState.seed);
  let engine = 3;
  let lastJump = null;
  let pendingJumps = [];
  let animating = false;

  const M = {
    mission: S.missions.TERRA_M1,
    params: S.sim.TERRA_PARAMS,
    phase: 'question',
    replay: false,
    targetEngine: null,
    predictedM: null,
    committed: false,
    official: null,
    prevOfficialM: null,
    snapDone: false,
    squadUnlocked: false,
    publishCtx: null,
  };

  const reducedMotion = () =>
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    saveState.settings.reducedMotion;

  let warnedSaveFailure = false;
  function persist() {
    if (S.save.store(saveState)) return;
    // storage full (chart PNGs add up): degrade gracefully — drop the
    // embedded images from the oldest articles, keep every word and number
    for (const a of saveState.articles.slice(0, -5)) delete a.chartDataURL;
    for (const c of saveState.ruleCards.slice(0, -5)) delete c.chartDataURL;
    if (S.save.store(saveState)) return;
    if (!warnedSaveFailure) {
      warnedSaveFailure = true;
      say('Heads up: this device is not letting me save progress right now. You can keep playing!');
    }
  }

  // ---------- screens ----------

  const SCREENS = ['screen-title', 'screen-lab', 'screen-mission', 'screen-museum'];
  function showScreen(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (id === 'screen-museum') {
      S.journal.renderMuseum($('exhibit-list'), saveState.articles);
      S.journal.renderCodex($('codex-list'), saveState.ruleCards);
    }
    if (id === 'screen-lab') refreshLab();
  }

  function refreshLab() {
    $('lab-meta').textContent = `Sol ${saveState.sol} · Universe seed ${saveState.seed}`;
    const done = saveState.missions['terra-1'] && saveState.missions['terra-1'].complete;
    $('terra-status').textContent = done
      ? '✅ The Engine Law — discovered! Tap for a Mystery Dataset ↻'
      : 'Mission 1: The Engine Law';
  }

  // ---------- speech, impact words ----------

  let speechTimer = null;
  function say(text, who) {
    const el = $('speech-bubble');
    el.textContent = (who === 'duck' ? '🦆 ' : '🤖 ') + text;
    el.classList.remove('off');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => el.classList.add('off'), 8000);
  }

  function impactWord(kind, atM) {
    if (reducedMotion()) return;
    const el = $('impact-word');
    el.textContent = S.jokes.impactWord(kind);
    const canvas = $('world-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = S.world.landingScreenX(atM) * (rect.width / canvas.width);
    el.style.left = Math.min(rect.width - 90, Math.max(6, x - 40)) + 'px';
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth; // restart the pop animation
    el.classList.add('pop');
    setTimeout(() => el.classList.add('hidden'), 900);
  }

  // ---------- engine variable (one variable, two views) ----------

  function setEngine(v, opts) {
    const o = opts || {};
    const requested = Number(v);
    const clamped = S.sim.clampEngine(requested);
    if (isFinite(requested) && requested !== clamped && !o.quiet) {
      say(S.jokes.draw('clamped'));
    }
    engine = clamped;
    $('engine-slider').value = clamped;
    $('engine-value').textContent = clamped;
    S.gameconsole.setSlotValue('engine', clamped);
  }

  // ---------- the KidCode host: code is the instrument ----------

  function friendly(msg) {
    const e = new Error(msg);
    e.friendly = true;
    return e;
  }

  function doJump() {
    const result = S.sim.simulateJump({ engine, params: M.params });
    lastJump = result;
    pendingJumps.push(result);
    S.notebook.addAuto(result.engine, result.distance);
    return result.distance;
  }

  function makeHost() {
    const data = S.kidcode.makeDataCommands({
      record(v) {
        if (lastJump && v === lastJump.distance) {
          throw friendly("Good instinct — but Hopper's suit already recorded that jump automatically. On Terra, every jump auto-logs to the notebook!");
        }
        S.notebook.addManual(v);
      },
    });
    return {
      commands: Object.assign({
        jump() {
          if (M.phase === 'predict' || M.phase === 'test') {
            throw friendly('The official run is armed! Use the big 🚀 Official Run button — that one counts.');
          }
          return doJump();
        },
        scan() {
          throw friendly('scan() is for critter worlds — Census-7 is a future expedition!');
        },
      }, data),
      getVar(name) {
        if (name === 'hopper.engine') return engine;
        if (name === 'jump.distance') return lastJump ? lastJump.distance : 0;
        if (name === 'jumps') return S.notebook.values();
        if (name === 'gravity') return M.params.gravity;
        return undefined;
      },
      hasVar(name) { return name === 'hopper.engine' || name === 'jump.distance'; },
      setVar(name, v) {
        if (name === 'hopper.engine') {
          if (typeof v !== 'number') throw friendly('hopper.engine needs a number from 1 to 10.');
          setEngine(v);
          return;
        }
        throw friendly('jump.distance is a measurement — Hopper writes it, you read it!');
      },
      varNames() { return ['hopper.engine', 'jump.distance', 'jumps', 'gravity']; },
    };
  }

  function runSource(source) {
    if (animating) { say('One moment — Hopper is mid-experiment!'); return; }
    pendingJumps = [];
    const result = S.kidcode.run(source, makeHost());
    S.gameconsole.showResult(result);
    const jumps = pendingJumps;
    pendingJumps = [];
    if (jumps.length === 1) {
      playSingleJump(jumps[0]);
    } else if (jumps.length > 1) {
      playMontage(jumps);
    }
    afterDataChange();
  }

  function playSingleJump(result, onDone) {
    animating = true;
    S.audio.jump();
    const kind = result.engine <= 2 ? 'tiny' : (result.engine >= 9 ? 'big' : 'mid');
    S.world.animateJump(result, {
      onDone() {
        animating = false;
        S.audio.land();
        impactWord('land', result.distance);
        if (result.clamped) say(S.jokes.draw('bigJump'));
        else say(S.jokes.draw(kind === 'tiny' ? 'tinyJump' : (kind === 'big' ? 'bigJump' : 'midJump')));
        if (onDone) onDone();
      },
    });
    if (reducedMotion()) { /* animateJump already finished instantly */ }
  }

  function playMontage(jumps) {
    animating = true;
    let i = 0;
    const total = jumps.length;
    const t0 = Date.now();
    const step = () => {
      if (i >= total) {
        animating = false;
        S.world.setMontageText(null);
        say(S.jokes.draw('montage') + ` (${total} trials logged)`);
        return;
      }
      const result = jumps[i];
      S.world.setMontageText(`Trial ${i + 1}/${total}`);
      i++;
      // fast-forward guarantee: the whole montage takes at most ~3 s of
      // real time, even on slow or throttled devices
      if (Date.now() - t0 > 3000) {
        step();
        return;
      }
      S.audio.montageTick(i - 1);
      S.world.animateJump(result, { montage: true, onDone: step });
    };
    step();
  }

  // ---------- phases ----------

  const PHASES = ['question', 'collect', 'chart', 'predict', 'test', 'publish'];

  const HINTS = {
    question: 'Every world runs on a hidden rule. Ready to uncover this one?',
    collect: 'Change hopper.engine (slider or code), then Jump. Try at least 3 different settings — the notebook logs every jump.',
    chart: 'Study the dots in the notebook. How far apart are they? Does the gap change?',
    predict: 'Commit BEFORE you test — that\'s what makes it science.',
    test: 'One official run. The band shows how close counts.',
    publish: 'Turn your notebook page into a Hopper Journal article!',
  };

  // test's next button only appears AFTER the official run (see finishOfficial)
  const NEXT_LABELS = {
    question: '🔬 Start collecting →',
    collect: '📈 To the chart! →',
    chart: '🎯 I see a pattern →',
    predict: null,
    test: null,
    publish: null,
  };

  function setPhase(phase) {
    M.phase = phase;
    // step tracker
    const items = document.querySelectorAll('#step-tracker li');
    const idx = PHASES.indexOf(phase);
    items.forEach((li, i) => {
      li.classList.toggle('active', i === idx);
      li.classList.toggle('done', i < idx);
      if (i === idx) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    $('phase-hint').textContent = HINTS[phase];

    const next = $('btn-phase-next');
    next.textContent = NEXT_LABELS[phase] || '';
    next.classList.toggle('hidden', !NEXT_LABELS[phase]);
    next.disabled = phase === 'collect' ? S.notebook.distinctEngines() < M.mission.minDistinctSettings : false;

    $('predict-panel').classList.toggle('hidden', phase !== 'predict');
    $('test-panel').classList.toggle('hidden', phase !== 'test');
    $('btn-jump').disabled = (phase === 'predict' || phase === 'test');
    $('tab-journal').disabled = phase !== 'publish';

    const slider = $('engine-slider');
    if (phase === 'predict' || phase === 'test') {
      slider.disabled = true;
      $('engine-locked-note').textContent = '(locked for the official run)';
    } else {
      slider.disabled = false;
      $('engine-locked-note').textContent = '';
    }

    // a fair test locks EVERY route to the tuned variable, code included
    if (phase === 'predict' || phase === 'test') {
      S.gameconsole.setEnabled(false,
        'The console is locked while the official run is armed — a fair test means no tweaking mid-experiment!');
    } else {
      S.gameconsole.setEnabled(true);
    }

    if (phase === 'question') {
      say(M.mission.question);
    }
    if (phase === 'collect') {
      selectTab('console');
      updateCollectProgress();
    }
    if (phase === 'chart') {
      selectTab('notebook');
      enterChartPhase();
    }
    if (phase === 'predict') {
      enterPredictPhase();
    }
    if (phase === 'publish') {
      enterPublishPhase();
    }
  }

  function advancePhase() {
    S.audio.uiClick();
    const idx = PHASES.indexOf(M.phase);
    if (idx >= 0 && idx < PHASES.length - 1) setPhase(PHASES[idx + 1]);
  }

  function updateCollectProgress() {
    if (M.phase !== 'collect') return;
    const distinct = S.notebook.distinctEngines();
    const need = M.mission.minDistinctSettings;
    const next = $('btn-phase-next');
    next.disabled = distinct < need;
    $('phase-hint').textContent = distinct < need
      ? `${HINTS.collect} (${distinct} of ${need} settings tried)`
      : `Nice data! ${distinct} settings tried. Head to the chart when you're ready.`;
    if (!M.squadUnlocked && S.notebook.trials().length >= 3) {
      M.squadUnlocked = true;
      if (S.gameconsole.unlockTemplate('squad')) {
        say('New code unlocked: the Jump Squad — repeat loops collect data FAST.');
      }
    }
  }

  function afterDataChange() {
    // keep the save in sync with the notebook (honest data: never dropped)
    const mid = M.mission.id;
    saveState.missions[mid] = Object.assign({}, saveState.missions[mid], {
      trials: S.notebook.trials(),
      replay: M.replay,
    });
    persist();
    updateCollectProgress();
  }

  function linearityFit() {
    const pairs = S.notebook.engineDistancePairs();
    if (pairs.length < 3) return null;
    return S.stats.linearFit(pairs.map((p) => p.engine), pairs.map((p) => p.distance));
  }

  function enterChartPhase() {
    const fit = linearityFit();
    const isLinear = fit && Math.max.apply(null, fit.residuals.map(Math.abs)) < 0.35;
    S.notebook.setOverlays({ showGaps: true, snap: !!isLinear });
    if (isLinear && !M.snapDone) {
      M.snapDone = true;
      S.audio.snap();
      impactWord('pattern', 25);
      say(S.jokes.draw('pattern'));
    } else if (!isLinear) {
      say('Hmm — more dots might make the pattern clearer. You can go back and collect more anytime.');
    }
  }

  function enterPredictPhase() {
    const tested = S.notebook.engineDistancePairs().map((p) => p.engine);
    if (M.targetEngine == null) {
      M.targetEngine = S.missions.chooseTargetEngine(M.mission, tested, rng.fork('target-' + saveState.sol));
    }
    setEngine(M.targetEngine, { quiet: true });
    $('engine-slider').disabled = true;
    // honest framing: only claim "never tested" when it's true
    const untested = tested.indexOf(M.targetEngine) < 0;
    $('predict-prompt').innerHTML =
      `The official run will use <b>engine = ${M.targetEngine}</b> — ` +
      (untested ? 'a setting you never tested! ' : 'a setting you measured before. Can you nail it exactly? ') +
      `How far will Hopper fly? Type a number or drag the flag on the field.`;
    const input = $('predict-input');
    input.value = M.predictedM != null ? M.predictedM : '';
    M.committed = false;
    if (M.predictedM != null) previewPrediction(M.predictedM);
    say('Predict first, jump second. That\'s the scientist way!');
  }

  function previewPrediction(m) {
    M.predictedM = m;
    S.world.setPrediction(m, M.mission.toleranceM, false);
    S.notebook.setOverlays({ predictedM: m, toleranceM: M.mission.toleranceM });
  }

  function commitPrediction() {
    const v = parseFloat($('predict-input').value);
    if (!isFinite(v) || v < 0 || v > S.world.WORLD_WIDTH_M) {
      say(`I need a distance between 0 and ${S.world.WORLD_WIDTH_M} m to lock in.`);
      S.audio.error();
      return;
    }
    M.predictedM = Math.round(v * 10) / 10;
    M.committed = true;
    S.world.setPrediction(M.predictedM, M.mission.toleranceM, true);
    S.audio.lock();
    setPhase('test');
    $('btn-official').disabled = false;
    $('test-result').classList.add('hidden');
    say(`Locked: ${S.chartscale.formatValue(M.predictedM)} m. No take-backs — that's the fun part!`);
  }

  function runOfficial() {
    if (animating) { say('One moment — Hopper is still finishing the last run!'); return; }
    if (!M.committed) return;
    $('btn-official').disabled = true;
    const result = S.sim.simulateJump({ engine: M.targetEngine, params: M.params });
    lastJump = result;
    S.notebook.addAuto(result.engine, result.distance);
    animating = true;
    S.audio.jump();
    S.world.animateJump(result, {
      onDone() {
        animating = false;
        S.audio.land();
        impactWord('land', result.distance);
        finishOfficial(result);
      },
    });
  }

  function finishOfficial(result) {
    M.official = result;
    const ev = S.missions.evaluatePrediction(M.mission, M.predictedM, result.distance);
    const mid = M.mission.id;
    const best = saveState.bests[mid];
    const isBest = best == null || ev.errorM < best;
    if (isBest) saveState.bests[mid] = ev.errorM;
    afterDataChange();

    S.audio.stars(ev.stars);
    if (ev.stars === 3) S.world.celebrate(result.distance);

    const stars = '⭐'.repeat(ev.stars);
    const bestNote = isBest
      ? (best == null ? '' : ` 🏆 New personal best (was off by ${S.chartscale.formatValue(best)} m)!`)
      : ` Personal best: off by ${S.chartscale.formatValue(saveState.bests[mid])} m.`;
    const resultEl = $('test-result');
    resultEl.innerHTML =
      `<p><b>Landed: ${S.chartscale.formatValue(result.distance)} m.</b> ` +
      `You predicted ${S.chartscale.formatValue(M.predictedM)} m — off by ${S.chartscale.formatValue(ev.errorM)} m. ${stars}</p>` +
      `<p>${ev.withinBand ? 'Inside the band — your model of the world WORKS.' : 'Outside the band — the chart holds the clue. Try again!'}${bestNote}</p>`;
    resultEl.classList.remove('hidden');

    if (ev.errorM <= 0.5) say(S.jokes.draw('perfect'), null);
    else if (ev.withinBand) say(S.jokes.draw(isBest ? 'newBest' : 'nearMiss'));
    else say(S.jokes.draw('bigMiss'));

    // one committed prediction = one official run; re-arming requires
    // going back through Predict (no double-logging to inflate n)
    $('btn-official').disabled = true;
    $('btn-retry').classList.remove('hidden');
    $('btn-phase-next').classList.remove('hidden');
    $('btn-phase-next').textContent = '📰 Write it up! →';
    $('btn-phase-next').disabled = false;
  }

  function retryPrediction() {
    S.audio.uiClick();
    M.prevOfficialM = M.official ? M.official.distance : null;
    S.world.setPrevGhost(M.prevOfficialM);
    S.notebook.setOverlays({ prevOfficialM: M.prevOfficialM });
    $('btn-retry').classList.add('hidden');
    $('test-result').classList.add('hidden');
    setPhase('predict');
  }

  function enterPublishPhase() {
    selectTab('journal');
    // capture a clean chart for the article: keep the aha (gaps), drop the
    // prediction overlays
    S.notebook.setOverlays({ predictedM: null, toleranceM: null, prevOfficialM: null, showGaps: true });
    const fit = linearityFit();
    const chartDataURL = S.notebook.chartDataURL();
    S.notebook.setOverlays({ predictedM: M.predictedM, toleranceM: M.mission.toleranceM });
    M.publishCtx = {
      mission: M.mission,
      playerName: saveState.player.name,
      sol: saveState.sol,
      trials: S.notebook.trials(),
      chartDataURL,
      fitSlope: fit ? fit.slope : M.params.vxPerEngine,
      rng: rng.fork('quackers-' + saveState.sol),
    };
    S.journal.openForMission(M.publishCtx);
  }

  function onPublished(article, quackersLine) {
    saveState.articles.push(article);
    const cardId = M.replay ? 'engine-law-mystery-sol' + saveState.sol : 'engine-law-terra';
    if (!saveState.ruleCards.some((c) => c.id === cardId)) {
      saveState.ruleCards.push({
        id: cardId,
        name: M.replay ? 'The Engine Law (Mystery Dataset)' : 'The Engine Law',
        text: `On ${M.mission.worldName}: each +1 engine adds about ${S.chartscale.formatValue(M.publishCtx.fitSlope)} m to Hopper's jump. Discovered by ${article.byline} with ${article.n} jumps.`,
        chartDataURL: article.chartDataURL,
      });
    }
    if (article.n >= 5 && saveState.badges.indexOf('replicator') < 0) {
      saveState.badges.push('replicator');
      say('🏅 Replicator badge: you collected 5+ trials before concluding. That\'s real science.');
    }
    const mid = M.mission.id;
    saveState.missions[mid] = Object.assign({}, saveState.missions[mid], { complete: true, replayActive: null });
    saveState.sol += 1;
    persist();
    S.audio.publish();
    $('publish-done').classList.remove('hidden');
    $('publish-form').classList.add('hidden');
    $('published-title').textContent = `“${article.title}” is published!`;
    if (quackersLine) setTimeout(() => say(quackersLine, 'duck'), 1200);
    else say(S.jokes.draw('publish'));
  }

  // ---------- mission setup ----------

  function enterTerra() {
    const mid = 'terra-1';
    let rec = saveState.missions[mid];
    M.replay = !!(rec && rec.complete);
    let resumingReplay = false;
    if (M.replay) {
      // an interrupted Mystery Dataset resumes with the SAME hidden law and
      // its collected trials — honest data is never silently discarded
      if (rec.replayActive) {
        resumingReplay = true;
      } else {
        const replays = (rec.replays || 0) + 1;
        saveState.missions[mid] = rec = Object.assign({}, rec, {
          replays, replayActive: replays, trials: [],
        });
        persist();
      }
      M.params = S.sim.mysteryTerraParams(saveState.seed + (rec.replayActive || rec.replays) * 1000);
    } else {
      M.params = S.sim.TERRA_PARAMS;
    }
    M.targetEngine = null;
    M.predictedM = null;
    M.committed = false;
    M.official = null;
    M.prevOfficialM = null;
    M.snapDone = false;
    M.squadUnlocked = false;
    M.publishCtx = null;

    // abandon any in-flight animation cleanly — re-entering mid-jump must
    // never leave the animating flag stuck (permanent soft-lock otherwise)
    animating = false;
    pendingJumps = [];
    S.notebook.reset();
    S.world.reset();
    S.gameconsole.clearOutput();
    S.gameconsole.clearError();

    // restore an unfinished expedition's data (never throw data away) —
    // both first-run progress and an interrupted mystery replay
    if (rec && rec.trials && rec.trials.length && (!rec.complete || resumingReplay)) {
      for (const t of rec.trials) {
        if (t.engine != null) S.notebook.addAuto(t.engine, t.distance);
        else S.notebook.addManual(t.distance);
      }
    }

    $('mission-name').textContent = M.mission.title + (M.replay ? ' · Mystery Dataset ↻' : '');
    $('mission-question').textContent = M.mission.question;
    $('publish-done').classList.add('hidden');
    $('publish-form').classList.remove('hidden');

    setupTemplates();
    setEngine(3, { quiet: true });
    showScreen('screen-mission');
    // replays skip the intro quiz and start from the opposite extreme
    if (M.replay) {
      setEngine(8, { quiet: true });
      say('A Mystery Dataset! Same law shape, brand-new hidden numbers. Go find them.');
      setPhase('collect');
    } else {
      setPhase(S.notebook.trials().length ? 'collect' : 'question');
    }
  }

  function setupTemplates() {
    S.gameconsole.setTemplates([
      {
        id: 'one-jump',
        label: 'One careful jump',
        lines: [
          { text: 'hopper.engine = ', slot: { id: 'engine', value: engine, min: 1, max: 10, label: 'engine setting' } },
          { text: 'jump()' },
        ],
      },
      {
        id: 'squad',
        label: 'Jump Squad (batch trials)',
        locked: !M.squadUnlocked,
        lines: [
          { text: 'hopper.engine = ', slot: { id: 'engine2', value: 5, min: 1, max: 10, label: 'engine setting for the squad' } },
          { text: 'repeat ', slot: { id: 'reps', value: 5, min: 1, max: 20, label: 'how many jumps' }, tail: ':' },
          { text: '  jump()' },
          { text: 'average(jumps)' },
        ],
      },
    ]);
  }

  // ---------- tabs ----------

  const TABS = { notebook: 'panel-notebook', console: 'panel-console', journal: 'panel-journal' };
  function selectTab(name) {
    for (const t in TABS) {
      $('tab-' + t).setAttribute('aria-selected', t === name ? 'true' : 'false');
      $(TABS[t]).classList.toggle('hidden', t !== name);
    }
  }

  // ---------- boot ----------

  function boot() {
    S.notebook.init({
      tableBody: document.querySelector('#notebook-table tbody'),
      chartCanvas: $('chart-canvas'),
      summaryEl: $('chart-summary'),
    });
    S.world.init($('world-canvas'), { reducedMotion: reducedMotion() });
    S.world.setSeed(rng);
    S.jokes.init(rng);
    S.audio.init(saveState.settings.muted);
    updateMuteLabel();

    S.gameconsole.init({
      areaEl: $('template-area'),
      freeEl: $('free-code'),
      runBtn: $('btn-run'),
      modeBtn: $('btn-mode-toggle'),
      errEl: $('console-error'),
      outEl: $('console-output'),
    }, {
      onRun: runSource,
      onSlotChange(id, v) {
        if (id === 'engine' || id === 'engine2') setEngine(v, { quiet: true });
      },
    });

    S.journal.init({
      titleEl: $('article-title'),
      bylineEl: $('article-byline'),
      chartImgEl: $('article-chart-img'),
      noteEl: $('article-note'),
      previewEl: $('conclusion-preview'),
      publishBtn: $('btn-publish'),
      quackersBox: $('quackers-box'),
      quackersTextEl: $('quackers-text'),
      moreTrialsBtn: $('btn-more-trials'),
      publishAnywayBtn: $('btn-publish-anyway'),
      tileRows: [$('tiles-1'), $('tiles-2'), $('tiles-3')],
    }, {
      onPublished,
      onWantMoreTrials() {
        setPhase('collect');
        say('Smart move. A few more jumps and the pattern gets rock solid.');
      },
    });

    // top bar
    $('nav-lab').addEventListener('click', () => { S.audio.uiClick(); showScreen('screen-lab'); });
    $('nav-museum').addEventListener('click', () => { S.audio.uiClick(); showScreen('screen-museum'); });
    $('btn-mute').addEventListener('click', toggleMute);

    // title screen
    $('player-name').value = saveState.player.name;
    $('btn-start').addEventListener('click', () => {
      S.audio.unlock();
      S.audio.uiClick();
      const name = $('player-name').value.trim();
      saveState.player.name = name || 'Junior Scientist';
      persist();
      showScreen('screen-lab');
    });

    // lab
    $('world-terra').addEventListener('click', () => { S.audio.unlock(); S.audio.uiClick(); enterTerra(); });
    $('btn-museum').addEventListener('click', () => { S.audio.uiClick(); showScreen('screen-museum'); });
    $('btn-back-lab').addEventListener('click', () => { S.audio.uiClick(); showScreen('screen-lab'); });

    // mission controls
    $('engine-slider').addEventListener('input', (e) => setEngine(e.target.value, { quiet: true }));
    $('btn-jump').addEventListener('click', () => {
      S.audio.unlock();
      if (M.phase === 'question') advancePhase();
      runSource(`hopper.engine = ${engine}\njump()`);
    });
    $('btn-phase-next').addEventListener('click', advancePhase);
    $('btn-commit').addEventListener('click', commitPrediction);
    $('btn-official').addEventListener('click', runOfficial);
    $('btn-retry').addEventListener('click', retryPrediction);
    $('btn-done-museum').addEventListener('click', () => showScreen('screen-museum'));
    $('btn-done-lab').addEventListener('click', () => showScreen('screen-lab'));

    $('predict-input').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (isFinite(v)) previewPrediction(Math.min(S.world.WORLD_WIDTH_M, Math.max(0, v)));
    });

    // drag the prediction flag on the field
    const canvas = $('world-canvas');
    let dragging = false;
    const dragTo = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      const xCanvas = (clientX - rect.left) * (canvas.width / rect.width);
      const m = Math.min(S.world.WORLD_WIDTH_M, Math.max(0, (xCanvas - S.world.ORIGIN_X) / S.world.PX_PER_M));
      const rounded = Math.round(m * 2) / 2;
      $('predict-input').value = rounded;
      previewPrediction(rounded);
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (M.phase !== 'predict') return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      dragTo(e.clientX);
    });
    canvas.addEventListener('pointermove', (e) => { if (dragging && M.phase === 'predict') dragTo(e.clientX); });
    canvas.addEventListener('pointerup', () => { dragging = false; });

    // tabs
    for (const t in TABS) {
      $('tab-' + t).addEventListener('click', () => { S.audio.uiClick(); selectTab(t); });
    }

    // keyboard shortcuts (never steal keys from typing)
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
      if ($('screen-mission').classList.contains('hidden')) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); $('btn-jump').click(); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); $('btn-run').click(); }
    });

    // respect prefers-reduced-motion changes mid-session, not just at boot
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const apply = () => S.world.setReducedMotion(reducedMotion());
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else if (mq.addListener) mq.addListener(apply);
    }

    // service worker (PWA: works offline after first visit)
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode is a bonus, not a blocker */ });
    }

    showScreen('screen-title');
  }

  function toggleMute() {
    saveState.settings.muted = !saveState.settings.muted;
    S.audio.setMuted(saveState.settings.muted);
    persist();
    updateMuteLabel();
  }

  function updateMuteLabel() {
    const b = $('btn-mute');
    b.textContent = saveState.settings.muted ? '🔇 Sound off' : '🔊 Sound on';
    b.setAttribute('aria-pressed', saveState.settings.muted ? 'true' : 'false');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
