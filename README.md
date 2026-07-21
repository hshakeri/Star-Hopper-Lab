# ⭐ Star Hopper Lab

A retro-futuristic 2D space platformer for ages 9–16 that is secretly a research
lab. You pilot Hopper, a small robot, as a Junior Star Scientist. Every world
runs on a **hidden rule** you cannot see — you uncover it from data you collect
yourself, then prove you've found it with a prediction. You still get to
reprogram the universe; you just have to discover its laws first.

**Twin learning goals: CODING and DATA SCIENCE**, learned by doing real (tiny)
research.

## Play

Open `index.html` in any modern browser — no build step, no install, no
network needed after first load (it's a PWA). Or serve it locally:

```
python3 -m http.server 8000
# then visit http://localhost:8000
```

## The research loop

Every mission follows **Question → Collect → Chart → Predict → Test → Publish**:

1. A visible research question ("What does `hopper.engine` do?").
2. **Collect** — every jump auto-logs to the Field Notebook; `repeat 10: jump()`
   plays as a fast montage.
3. **Chart** — the notebook plots live; dot plot first, scatter and line charts
   in later worlds.
4. **Predict** — commit a number *before* the official run; the tolerance band
   and prediction ghost are drawn on screen.
5. **Test** — one official run, scored against your own personal best only.
6. **Publish** — your notebook page becomes an article in The Hopper Journal;
   Dr. Quackers (a skeptical lab duck) asks exactly one gentle question.

Discovered laws become collectible **Rule Cards** illustrated with your own
chart; published findings become exhibits in the **Lab Museum**.

## KidCode

A tiny interpreted language with a real tokenizer, parser, and runtime
(`js/core/kidcode.js`): variables (`engine = 5`), calls (`jump()`),
`repeat N:` loops with hard safety caps, event rules
(`when critter.spots > 5: friend()`), data calls (`average(jumps)`,
`count(jumps)`, `biggest(jumps)`, `record(...)`), and tiny models
(`predict(power) = start + slope * power`). Errors are friendly and specific,
with did-you-mean suggestions and data-aware hints. Missions offer scaffolded
templates with fill-in slots; free typing is always allowed.

## Worlds

| World | Concept | Status |
|---|---|---|
| 🌍 Terra Data | measurement & variables | ✅ playable |
| 🌪 Ventus | noise & replication | planned |
| 🪐 Correlata | relationships & models | planned |
| 🐾 Census-7 | sampling & bias | planned |
| 🛰 Sorter Station | classification & decision rules | planned |
| 🌊 Tempus (capstone) | data over time | planned |

## Honesty rules (non-negotiable)

- **Honest data only.** Hidden rules are real functions plus seeded, unbiased
  noise; the game never fabricates a point. Same seed ⇒ same storm.
- **Charts never lie.** Labeled axes, zero baselines, explicit break marks on
  zoomed axes, sensible rounding.
- **Fair tests.** Untuned variables are shown on screen labeled "(locked)".
- **Evidence before conclusions.** Peer review nudges, never gates. Badges
  reward science virtues, not grinding.
- **Healthy engagement only.** No accounts, ads, timers, streaks,
  leaderboards, or notifications. All saves local.

## Engineering

Zero-dependency vanilla HTML/CSS/JS. Deterministic fixed-step simulation; all
randomness flows through one seeded RNG (`js/core/rng.js`, mulberry32). The
sim, interpreter, stats, chart-scale, mission, and save modules are pure and
run in both browser and Node.

### Tests

```
node tests/run-tests.js
```

The regression suite covers interpreter safety caps and error messages, sim
determinism (trace hashes), mission solvability sweeps (≥2 winning answers,
visible near-misses), statistical honesty (unbiased noise over 10k draws;
the intended method recovers the hidden rule for ≥95% of seeds), chart
honesty, save/load round-trips, and service-worker version lockstep. CI runs
it on every push (`.github/workflows/tests.yml`).

### Cache versioning

The `?v=` stamps in `index.html` and `VERSION` in `sw.js` must be bumped
together — the test suite fails if they drift apart.

## For grown-ups

- [Parent one-pager](parents.html) — what your kid is learning, and how to ask about it.
- [Teacher one-pager](teachers.html) — each world mapped to one plain line of practice.
