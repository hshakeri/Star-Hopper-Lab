/* Star Hopper Lab — KidCode: a tiny language for junior scientists.
 *
 * Real tokenizer -> parser -> tree-walking runtime, with:
 *   variables        engine = 5        hopper.engine = 5
 *   calls            jump()            record(jump.distance)
 *   loops            repeat 10: jump()     (hard safety caps)
 *   data calls       average(jumps)  count(jumps)  biggest(jumps)
 *   event rules      when critter.spots > 5: friend()
 *   tiny models      predict(power) = start + slope * power
 *
 * Every error is friendly, specific, and names the line. Unknown commands
 * get a did-you-mean. Data calls give data-aware hints.
 * Runs in browser (window.SHL.kidcode) and Node (module.exports).
 */
(function () {
  'use strict';

  const KEYWORDS = ['repeat', 'when'];
  const DEFAULTS = { maxLoopIter: 100, maxOps: 5000 };

  function KidCodeError(message, line) {
    const e = new Error(message);
    e.name = 'KidCodeError';
    e.friendly = true;
    e.line = line || null;
    return e;
  }

  // ---------- did-you-mean ----------

  function levenshtein(a, b) {
    if (a === b) return 0;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev.push(j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur.push(Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        ));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function suggest(name, candidates) {
    let best = null, bestD = Infinity;
    for (const c of candidates) {
      const d = levenshtein(name.toLowerCase(), c.toLowerCase());
      if (d < bestD) { bestD = d; best = c; }
    }
    return (best !== null && bestD <= 2 && bestD < best.length) ? best : null;
  }

  // ---------- tokenizer ----------

  function tokenize(source) {
    const tokens = [];
    const indentStack = [0];
    const lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
    let lastLine = 1;

    for (let li = 0; li < lines.length; li++) {
      const lineNo = li + 1;
      let line = lines[li];
      const hashIdx = line.indexOf('#');
      if (hashIdx >= 0) line = line.slice(0, hashIdx);
      if (line.trim() === '') continue;
      lastLine = lineNo;

      let i = 0, indent = 0;
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
        indent += line[i] === '\t' ? 4 : 1;
        i++;
      }
      const top = indentStack[indentStack.length - 1];
      if (indent > top) {
        indentStack.push(indent);
        tokens.push({ type: 'INDENT', line: lineNo });
      } else {
        while (indent < indentStack[indentStack.length - 1]) {
          indentStack.pop();
          tokens.push({ type: 'DEDENT', line: lineNo });
        }
        if (indent !== indentStack[indentStack.length - 1]) {
          throw KidCodeError(`The spaces at the start of line ${lineNo} don't line up with any line above it. Try matching the indent of an earlier line.`, lineNo);
        }
      }

      while (i < line.length) {
        const ch = line[i];
        if (ch === ' ' || ch === '\t') { i++; continue; }
        if (/[0-9]/.test(ch)) {
          let j = i;
          while (j < line.length && /[0-9.]/.test(line[j])) j++;
          const raw = line.slice(i, j);
          if ((raw.match(/\./g) || []).length > 1) {
            throw KidCodeError(`'${raw}' has too many dots to be a number (line ${lineNo}).`, lineNo);
          }
          tokens.push({ type: 'NUM', value: parseFloat(raw), line: lineNo });
          i = j; continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
          let j = i;
          while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++;
          const word = line.slice(i, j);
          tokens.push({ type: KEYWORDS.indexOf(word) >= 0 ? 'KEYWORD' : 'IDENT', value: word, line: lineNo });
          i = j; continue;
        }
        const two = line.slice(i, i + 2);
        if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
          tokens.push({ type: 'OP', value: two, line: lineNo }); i += 2; continue;
        }
        if ('=<>+-*/'.indexOf(ch) >= 0) { tokens.push({ type: 'OP', value: ch, line: lineNo }); i++; continue; }
        if (ch === '(') { tokens.push({ type: 'LPAREN', line: lineNo }); i++; continue; }
        if (ch === ')') { tokens.push({ type: 'RPAREN', line: lineNo }); i++; continue; }
        if (ch === ':') { tokens.push({ type: 'COLON', line: lineNo }); i++; continue; }
        if (ch === ',') { tokens.push({ type: 'COMMA', line: lineNo }); i++; continue; }
        if (ch === '.') { tokens.push({ type: 'DOT', line: lineNo }); i++; continue; }
        if (ch === '"' || ch === "'") {
          throw KidCodeError(`KidCode doesn't use quotes — just write numbers and names (line ${lineNo}).`, lineNo);
        }
        throw KidCodeError(`I don't understand the character '${ch}' on line ${lineNo}.`, lineNo);
      }
      tokens.push({ type: 'NEWLINE', line: lineNo });
    }
    while (indentStack.length > 1) {
      indentStack.pop();
      tokens.push({ type: 'DEDENT', line: lastLine });
    }
    tokens.push({ type: 'EOF', line: lastLine });
    return tokens;
  }

  // ---------- parser ----------

  function describeToken(t) {
    switch (t.type) {
      case 'NUM': return `the number ${t.value}`;
      case 'IDENT': return `'${t.value}'`;
      case 'KEYWORD': return `'${t.value}'`;
      case 'OP': return `'${t.value}'`;
      case 'LPAREN': return `'('`;
      case 'RPAREN': return `')'`;
      case 'COLON': return `':'`;
      case 'COMMA': return `','`;
      case 'DOT': return `'.'`;
      case 'NEWLINE': return 'the end of the line';
      case 'EOF': return 'the end of the program';
      default: return t.type.toLowerCase();
    }
  }

  function parse(tokens) {
    let pos = 0;
    const peek = (k) => tokens[pos + (k || 0)] || tokens[tokens.length - 1];
    const advance = () => tokens[pos++];

    function expect(type, what) {
      const t = peek();
      if (t.type !== type) {
        throw KidCodeError(`I expected ${what} but found ${describeToken(t)} on line ${t.line}.`, t.line);
      }
      return advance();
    }

    function parseProgram() {
      const body = [];
      while (peek().type !== 'EOF') {
        if (peek().type === 'NEWLINE' || peek().type === 'DEDENT') { advance(); continue; }
        const stmt = parseStatement();
        body.push(stmt);
        // a block suite already consumed through its DEDENT — no NEWLINE left
        if (!stmt.wasBlock) endOfStatement();
      }
      return { type: 'Program', body };
    }

    function endOfStatement() {
      const t = peek();
      if (t.type !== 'NEWLINE' && t.type !== 'DEDENT' && t.type !== 'EOF') {
        throw KidCodeError(`Line ${t.line}: I can only follow one instruction per line, but I found ${describeToken(t)} after the first one.`, t.line);
      }
    }

    function parseStatement() {
      const t = peek();
      if (t.type === 'KEYWORD' && t.value === 'repeat') return parseRepeat();
      if (t.type === 'KEYWORD' && t.value === 'when') return parseWhen();
      return parseSimple();
    }

    function parseRepeat() {
      const kw = advance();
      const count = parseExpr();
      if (peek().type !== 'COLON') {
        throw KidCodeError(`repeat needs a ':' after the number — like  repeat 5: jump()  (line ${kw.line}).`, kw.line);
      }
      advance();
      const suite = parseSuite(kw.line);
      return { type: 'Repeat', count, body: suite.body, wasBlock: suite.wasBlock, line: kw.line };
    }

    function parseWhen() {
      const kw = advance();
      const cond = parseExpr();
      if (peek().type !== 'COLON') {
        throw KidCodeError(`when needs a ':' after the test — like  when critter.spots > 5: friend()  (line ${kw.line}).`, kw.line);
      }
      advance();
      const suite = parseSuite(kw.line);
      return { type: 'When', cond, body: suite.body, wasBlock: suite.wasBlock, line: kw.line };
    }

    function parseSuite(startLine) {
      if (peek().type === 'NEWLINE') {
        advance();
        while (peek().type === 'NEWLINE') advance();
        if (peek().type !== 'INDENT') {
          throw KidCodeError(`After the ':' on line ${startLine} I need something to do — put it on the same line, or indent the next line with two spaces.`, startLine);
        }
        advance();
        const body = [];
        while (peek().type !== 'DEDENT' && peek().type !== 'EOF') {
          if (peek().type === 'NEWLINE') { advance(); continue; }
          const stmt = parseStatement();
          body.push(stmt);
          if (!stmt.wasBlock) {
            endOfStatement();
            if (peek().type === 'NEWLINE') advance();
          }
        }
        if (peek().type === 'DEDENT') advance();
        return { body, wasBlock: true };
      }
      const stmt = parseStatement();
      return { body: [stmt], wasBlock: false };
    }

    function parseSimple() {
      const t = peek();
      // tiny model definition:  name(param) = expr
      if (t.type === 'IDENT' && peek(1).type === 'LPAREN' && peek(2).type === 'IDENT' &&
          peek(3).type === 'RPAREN' && peek(4).type === 'OP' && peek(4).value === '=') {
        const name = advance().value;
        advance(); const param = advance().value; advance(); advance();
        return { type: 'ModelDef', name, param, expr: parseExpr(), line: t.line };
      }
      // assignment:  dotted.name = expr
      if (t.type === 'IDENT') {
        let p = pos + 1;
        while (tokens[p] && tokens[p].type === 'DOT' && tokens[p + 1] && tokens[p + 1].type === 'IDENT') p += 2;
        if (tokens[p] && tokens[p].type === 'OP' && tokens[p].value === '=') {
          const parts = [advance().value];
          while (peek().type === 'DOT') { advance(); parts.push(expect('IDENT', 'a name after the dot').value); }
          advance(); // '='
          return { type: 'Assign', name: parts.join('.'), expr: parseExpr(), line: t.line };
        }
      }
      return { type: 'ExprStmt', expr: parseExpr(), line: t.line };
    }

    function parseExpr() {
      let left = parseAdditive();
      const t = peek();
      if (t.type === 'OP' && ['>', '<', '>=', '<=', '==', '!='].indexOf(t.value) >= 0) {
        advance();
        const right = parseAdditive();
        return { type: 'Binary', op: t.value, left, right, line: t.line };
      }
      return left;
    }

    function parseAdditive() {
      let left = parseTerm();
      while (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
        const op = advance();
        left = { type: 'Binary', op: op.value, left, right: parseTerm(), line: op.line };
      }
      return left;
    }

    function parseTerm() {
      let left = parseUnary();
      while (peek().type === 'OP' && (peek().value === '*' || peek().value === '/')) {
        const op = advance();
        left = { type: 'Binary', op: op.value, left, right: parseUnary(), line: op.line };
      }
      return left;
    }

    function parseUnary() {
      if (peek().type === 'OP' && peek().value === '-') {
        const op = advance();
        return { type: 'Unary', op: '-', expr: parseUnary(), line: op.line };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const t = peek();
      if (t.type === 'NUM') { advance(); return { type: 'Num', value: t.value, line: t.line }; }
      if (t.type === 'LPAREN') {
        advance();
        const e = parseExpr();
        expect('RPAREN', `a closing ')'`);
        return e;
      }
      if (t.type === 'IDENT') {
        advance();
        if (peek().type === 'LPAREN') {
          advance();
          const args = [];
          if (peek().type !== 'RPAREN') {
            args.push(parseExpr());
            while (peek().type === 'COMMA') { advance(); args.push(parseExpr()); }
          }
          expect('RPAREN', `a closing ')' for ${t.value}(`);
          return { type: 'Call', name: t.value, args, line: t.line };
        }
        const parts = [t.value];
        while (peek().type === 'DOT') { advance(); parts.push(expect('IDENT', 'a name after the dot').value); }
        return { type: 'Name', name: parts.join('.'), line: t.line };
      }
      if (t.type === 'KEYWORD') {
        const example = t.value === 'repeat' ? 'repeat 5: jump()' : 'when critter.spots > 5: friend()';
        throw KidCodeError(`'${t.value}' starts its own line — like  ${example}  (line ${t.line}).`, t.line);
      }
      throw KidCodeError(`I got confused on line ${t.line} — I found ${describeToken(t)} where a number or name should be.`, t.line);
    }

    const program = parseProgram();
    return program;
  }

  // ---------- runtime ----------

  function exprToString(node) {
    switch (node.type) {
      case 'Num': return String(node.value);
      case 'Name': return node.name;
      case 'Call': return `${node.name}(${node.args.map(exprToString).join(', ')})`;
      case 'Unary': return `-${exprToString(node.expr)}`;
      case 'Binary': return `${exprToString(node.left)} ${node.op} ${exprToString(node.right)}`;
      default: return '?';
    }
  }

  function formatValue(v) {
    if (typeof v === 'number') {
      if (!isFinite(v)) return '?';
      const r = Math.round(v * 100) / 100;
      return String(r);
    }
    if (Array.isArray(v)) return `a list of ${v.length}`;
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    return String(v);
  }

  function makeEnv(host, options, output, whenRules) {
    return {
      vars: new Map(),
      models: new Map(),
      overlay: null,          // event-subject bindings during when-rules
      ops: 0,
      host: host || {},
      options,
      output,
      whenRules,
      lastValue: undefined,
    };
  }

  function tick(env, line) {
    env.ops++;
    if (env.ops > env.options.maxOps) {
      throw KidCodeError(`Whoa — this program is doing a LOT of work (over ${env.options.maxOps} steps). The lab safety system stopped it. Try fewer repeats.`, line);
    }
  }

  function knownNames(env) {
    const names = [];
    env.vars.forEach((_, k) => names.push(k));
    const host = env.host;
    if (host.varNames) {
      const hv = host.varNames();
      for (const n of hv) names.push(n);
    }
    return names;
  }

  function commandNames(env) {
    const names = [];
    const host = env.host;
    if (host.commands) for (const k in host.commands) names.push(k);
    env.models.forEach((_, k) => names.push(k));
    return names;
  }

  function lookupName(env, name, line) {
    if (env.overlay && Object.prototype.hasOwnProperty.call(env.overlay, name)) return env.overlay[name];
    if (env.vars.has(name)) return env.vars.get(name);
    const host = env.host;
    if (host.getVar) {
      const v = host.getVar(name);
      if (v !== undefined) return v;
    }
    const cands = knownNames(env);
    const s = suggest(name, cands);
    const cmd = suggest(name, commandNames(env));
    let msg = `I don't know the name '${name}' (line ${line}).`;
    if (s) msg += ` Did you mean ${s}?`;
    else if (cmd) msg += ` Did you mean ${cmd}()? (Commands need parentheses.)`;
    throw KidCodeError(msg, line);
  }

  function setName(env, name, value, line) {
    const host = env.host;
    if (host.setVar && host.hasVar && host.hasVar(name)) {
      host.setVar(name, value);
      return;
    }
    env.vars.set(name, value);
  }

  function callFunction(env, name, args, line) {
    // 1. player-defined tiny models
    if (env.models.has(name)) {
      const model = env.models.get(name);
      if (args.length !== 1) {
        throw KidCodeError(`${name}() takes exactly one number — like ${name}(5) — but got ${args.length} (line ${line}).`, line);
      }
      const savedOverlay = env.overlay;
      env.overlay = Object.assign({}, savedOverlay);
      env.overlay[model.param] = args[0];
      try {
        return evalExpr(env, model.expr);
      } finally {
        env.overlay = savedOverlay;
      }
    }
    // 2. host commands (jump, record, average, ...)
    const host = env.host;
    if (host.commands && Object.prototype.hasOwnProperty.call(host.commands, name)) {
      try {
        return host.commands[name].apply(null, args);
      } catch (e) {
        if (e && e.friendly) {
          if (!e.line) e.line = line;
          throw e;
        }
        throw KidCodeError(`${name}() hit a snag: ${e && e.message ? e.message : 'something unexpected'} (line ${line}).`, line);
      }
    }
    // 3. unknown: did-you-mean
    const cands = commandNames(env);
    const s = suggest(name, cands);
    let msg = `I don't know the command: '${name}()'.`;
    if (s) msg += ` Did you mean ${s}()?`;
    else if (cands.length) {
      msg += ` Commands I know: ${cands.slice(0, 6).map((c) => c + '()').join(', ')}.`;
    }
    throw KidCodeError(msg + ` (line ${line})`, line);
  }

  function evalExpr(env, node) {
    tick(env, node.line);
    switch (node.type) {
      case 'Num': return node.value;
      case 'Name': return lookupName(env, node.name, node.line);
      case 'Call': {
        const args = node.args.map((a) => evalExpr(env, a));
        return callFunction(env, node.name, args, node.line);
      }
      case 'Unary': {
        const v = evalExpr(env, node.expr);
        if (typeof v !== 'number') throw KidCodeError(`I can only negate numbers (line ${node.line}).`, node.line);
        return -v;
      }
      case 'Binary': {
        const l = evalExpr(env, node.left);
        const r = evalExpr(env, node.right);
        const op = node.op;
        if (op === '==' ) return l === r;
        if (op === '!=') return l !== r;
        if (typeof l !== 'number' || typeof r !== 'number') {
          let hint = '';
          if (Array.isArray(l) || Array.isArray(r)) {
            hint = ` A whole list can't go in math directly — try average(${Array.isArray(l) ? exprToString(node.left) : exprToString(node.right)}) first!`;
          }
          throw KidCodeError(`I can't do ${formatValue(l)} ${op} ${formatValue(r)}.${hint} (line ${node.line})`, node.line);
        }
        switch (op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/':
            if (r === 0) throw KidCodeError(`Dividing by zero would tear a hole in space. Hopper politely refuses. (line ${node.line})`, node.line);
            return l / r;
          case '>': return l > r;
          case '<': return l < r;
          case '>=': return l >= r;
          case '<=': return l <= r;
        }
        throw KidCodeError(`I don't know the operation '${op}' (line ${node.line}).`, node.line);
      }
    }
    throw KidCodeError(`I got lost in the code on line ${node.line}.`, node.line);
  }

  function execStatement(env, node) {
    tick(env, node.line);
    switch (node.type) {
      case 'Assign': {
        const v = evalExpr(env, node.expr);
        setName(env, node.name, v, node.line);
        env.lastValue = v;
        return;
      }
      case 'ModelDef': {
        env.models.set(node.name, { param: node.param, expr: node.expr, line: node.line });
        env.output.push(`Saved your ${node.name}(${node.param}) rule.`);
        return;
      }
      case 'ExprStmt': {
        const v = evalExpr(env, node.expr);
        env.lastValue = v;
        if (v !== undefined && v !== null) {
          env.output.push(`${exprToString(node.expr)} → ${formatValue(v)}`);
        }
        return;
      }
      case 'Repeat': {
        const n = evalExpr(env, node.count);
        if (typeof n !== 'number' || !isFinite(n)) {
          throw KidCodeError(`repeat needs a number — like  repeat 5:  (line ${node.line}).`, node.line);
        }
        const times = Math.floor(n);
        if (times > env.options.maxLoopIter) {
          throw KidCodeError(`repeat ${times}? Whoa! The lab safety cap is ${env.options.maxLoopIter} repeats at a time. Try a smaller number.`, node.line);
        }
        for (let i = 0; i < times; i++) execBlock(env, node.body);
        return;
      }
      case 'When': {
        env.whenRules.push({ cond: node.cond, body: node.body, line: node.line, source: exprToString(node.cond) });
        env.output.push(`Rule ready: when ${exprToString(node.cond)} → I'll do it each time you check something.`);
        return;
      }
    }
    throw KidCodeError(`I don't know what to do with that (line ${node.line}).`, node.line);
  }

  function execBlock(env, body) {
    for (const stmt of body) execStatement(env, stmt);
  }

  /* run(source, host, opts) -> { ok, error, errorLine, output, whenRules, value }
   * host: {
   *   commands: { name: fn(...args) },      // jump(), record(), average(), ...
   *   getVar(name) -> value | undefined,    // hopper.engine, jumps, jump.distance
   *   hasVar(name) -> bool, setVar(name, v),
   *   varNames() -> [names]                 // for did-you-mean
   * }
   */
  function run(source, host, opts) {
    const options = Object.assign({}, DEFAULTS, opts || {});
    const output = [];
    const whenRules = [];
    const result = { ok: true, error: null, errorLine: null, output, whenRules, value: undefined };
    let program;
    try {
      program = parse(tokenize(source));
    } catch (e) {
      result.ok = false;
      result.error = e.message;
      result.errorLine = e.line || null;
      return result;
    }
    const env = makeEnv(host, options, output, whenRules);
    result.env = env;
    try {
      execBlock(env, program.body);
      result.value = env.lastValue;
    } catch (e) {
      result.ok = false;
      result.error = e.friendly ? e.message : `Something unexpected happened: ${e.message}`;
      result.errorLine = e.line || null;
    }
    return result;
  }

  /* Fire stored when-rules against a subject, e.g.
   *   runWhenRules(result, 'critter', { spots: 7, glow: 2 })
   * Rule conditions and bodies see critter.spots, critter.glow, and critter.
   * Returns { fired: n, errors: [...] }.
   */
  function runWhenRules(result, subjectName, subject) {
    const env = result.env;
    if (!env) return { fired: 0, errors: ['No program has run yet.'] };
    const savedOverlay = env.overlay;
    const overlay = Object.assign({}, savedOverlay);
    overlay[subjectName] = subject;
    for (const key in subject) overlay[subjectName + '.' + key] = subject[key];
    env.overlay = overlay;
    let fired = 0;
    const errors = [];
    try {
      for (const rule of result.whenRules) {
        try {
          if (evalExpr(env, rule.cond)) {
            execBlock(env, rule.body);
            fired++;
          }
        } catch (e) {
          errors.push(e.message);
        }
      }
    } finally {
      env.overlay = savedOverlay;
    }
    return { fired, errors };
  }

  /* Standard data-command library. The game (or a test) supplies ctx:
   *   { record(value), lists: { jumps: () => [...] } }
   * and merges these into host.commands.
   */
  function makeDataCommands(ctx) {
    function needList(fnName, v, exampleList) {
      if (!Array.isArray(v)) {
        throw KidCodeError(`${fnName}() needs a list — like ${fnName}(${exampleList || 'jumps'}).`);
      }
    }
    function needNumbers(fnName, v) {
      needList(fnName, v);
      if (v.length === 0) {
        throw KidCodeError(`${fnName}() needs at least one number — record a jump first!`);
      }
    }
    return {
      record(v) {
        if (typeof v !== 'number' || !isFinite(v)) {
          throw KidCodeError(`record() needs a number to write down — like record(jump.distance).`);
        }
        ctx.record(v);
        return v;
      },
      average(list) { needNumbers('average', list); return list.reduce((a, b) => a + b, 0) / list.length; },
      count(list) { needList('count', list); return list.length; },
      biggest(list) { needNumbers('biggest', list); return Math.max.apply(null, list); },
      smallest(list) { needNumbers('smallest', list); return Math.min.apply(null, list); },
    };
  }

  const api = {
    tokenize, parse, run, runWhenRules, makeDataCommands,
    levenshtein, suggest, KidCodeError, DEFAULTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.SHL = window.SHL || {}; window.SHL.kidcode = api; }
})();
