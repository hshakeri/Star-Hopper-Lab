/* Star Hopper Lab — the KidCode console.
 * Scaffolded templates with fill-in slots (typing speed never blocks a
 * child), a free-typing mode that is always allowed, friendly error
 * display, and a console output log.
 */
(function () {
  'use strict';

  const state = {
    refs: null,          // { areaEl, freeEl, runBtn, modeBtn, errEl, outEl }
    templates: [],       // [{ id, label, lines: [{text, slot:{id,value,min,max}}], locked }]
    slotValues: {},      // slotId -> value
    freeMode: false,
    enabled: true,
    disabledMsg: '',
    onRun: null,
    onSlotChange: null,
  };

  function init(refs, callbacks) {
    state.refs = refs;
    state.onRun = callbacks.onRun;
    state.onSlotChange = callbacks.onSlotChange || null;
    refs.runBtn.addEventListener('click', runClicked);
    refs.modeBtn.addEventListener('click', toggleMode);
  }

  function setTemplates(templates) {
    state.templates = templates;
    for (const t of templates) {
      for (const line of t.lines) {
        if (line.slot && !(line.slot.id in state.slotValues)) {
          state.slotValues[line.slot.id] = line.slot.value;
        }
      }
    }
    renderTemplates();
  }

  function setSlotValue(id, v) {
    state.slotValues[id] = v;
    const input = state.refs.areaEl.querySelector(`input[data-slot="${id}"]`);
    if (input && String(input.value) !== String(v)) input.value = v;
  }

  function unlockTemplate(id) {
    let changed = false;
    for (const t of state.templates) {
      if (t.id === id && t.locked) { t.locked = false; t.fresh = true; changed = true; }
    }
    if (changed) renderTemplates();
    return changed;
  }

  function renderTemplates() {
    const area = state.refs.areaEl;
    area.innerHTML = '';
    for (const t of state.templates) {
      const box = document.createElement('div');
      box.className = 'template-box' + (t.locked ? ' locked' : '') + (t.fresh ? ' fresh' : '');
      const head = document.createElement('div');
      head.className = 'template-head';
      head.textContent = t.locked ? `🔒 ${t.label} — keep experimenting to unlock` : (t.fresh ? `✨ NEW: ${t.label}` : t.label);
      box.appendChild(head);
      if (!t.locked) {
        const code = document.createElement('div');
        code.className = 'template-code';
        for (const line of t.lines) {
          const row = document.createElement('div');
          row.className = 'template-line';
          const pre = document.createElement('span');
          pre.textContent = line.text;
          row.appendChild(pre);
          if (line.slot) {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = state.slotValues[line.slot.id];
            input.min = line.slot.min;
            input.max = line.slot.max;
            input.step = 1;
            input.dataset.slot = line.slot.id;
            input.setAttribute('aria-label', line.slot.label || 'code value');
            input.addEventListener('input', () => {
              state.slotValues[line.slot.id] = input.value;
              if (state.onSlotChange) state.onSlotChange(line.slot.id, input.value);
            });
            row.appendChild(input);
          }
          if (line.tail) {
            const tail = document.createElement('span');
            tail.textContent = line.tail;
            row.appendChild(tail);
          }
          code.appendChild(row);
        }
        box.appendChild(code);
        const runThis = document.createElement('button');
        runThis.className = 'template-run';
        runThis.textContent = `▶ Run ${t.label}`;
        runThis.addEventListener('click', () => runTemplate(t));
        box.appendChild(runThis);
      }
      area.appendChild(box);
    }
  }

  function templateSource(t) {
    return t.lines.map((line) => {
      let s = line.text;
      if (line.slot) s += clampSlot(line.slot, state.slotValues[line.slot.id]);
      if (line.tail) s += line.tail;
      return s;
    }).join('\n');
  }

  function clampSlot(slot, v) {
    let n = parseFloat(v);
    if (!isFinite(n)) n = slot.value;
    if (slot.min != null) n = Math.max(slot.min, n);
    if (slot.max != null) n = Math.min(slot.max, n);
    return String(n);
  }

  function runTemplate(t) {
    if (!guard()) return;
    dispatch(templateSource(t));
  }

  function runClicked() {
    if (!guard()) return;
    if (state.freeMode) {
      dispatch(state.refs.freeEl.value);
    } else {
      const first = state.templates.find((t) => !t.locked);
      if (first) dispatch(templateSource(first));
    }
  }

  function guard() {
    if (!state.enabled) {
      showError(state.disabledMsg || 'The console is paused right now.');
      return false;
    }
    clearError();
    return true;
  }

  function dispatch(source) {
    if (state.onRun) state.onRun(source);
  }

  function toggleMode() {
    state.freeMode = !state.freeMode;
    const r = state.refs;
    if (state.freeMode) {
      // seed the editor with the current template so kids edit, not start cold
      const first = state.templates.find((t) => !t.locked);
      if (first && !r.freeEl.value.trim()) r.freeEl.value = templateSource(first) + '\n';
      r.areaEl.classList.add('hidden');
      r.freeEl.classList.remove('hidden');
      r.modeBtn.textContent = '🧩 Back to templates';
      r.freeEl.focus();
    } else {
      r.areaEl.classList.remove('hidden');
      r.freeEl.classList.add('hidden');
      r.modeBtn.textContent = '✏️ Free typing';
    }
  }

  function setEnabled(enabled, msg) {
    state.enabled = enabled;
    state.disabledMsg = msg || '';
    state.refs.runBtn.disabled = !enabled;
  }

  function showError(msg) {
    const el = state.refs.errEl;
    el.textContent = '🤖 ' + msg;
    el.classList.remove('hidden');
    window.SHL.audio.error();
  }

  function clearError() {
    state.refs.errEl.classList.add('hidden');
    state.refs.errEl.textContent = '';
  }

  function appendOutput(lines) {
    if (!lines || !lines.length) return;
    const el = state.refs.outEl;
    el.textContent = (el.textContent + '\n' + lines.join('\n')).trim().split('\n').slice(-12).join('\n');
  }

  function clearOutput() {
    state.refs.outEl.textContent = '';
  }

  function showResult(result) {
    if (result.ok) {
      clearError();
      appendOutput(result.output);
    } else {
      showError(result.error);
    }
  }

  window.SHL = window.SHL || {};
  window.SHL.gameconsole = {
    init, setTemplates, setSlotValue, unlockTemplate, setEnabled,
    showResult, showError, clearError, appendOutput, clearOutput,
    isFreeMode: () => state.freeMode,
  };
})();
