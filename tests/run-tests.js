/* Star Hopper Lab regression suite.  Run:  node tests/run-tests.js */
'use strict';

require('./test-rng.js');
require('./test-sim.js');
require('./test-kidcode.js');
require('./test-stats.js');
require('./test-chartscale.js');
require('./test-missions.js');
require('./test-save.js');
require('./test-pwa.js');

require('./harness.js').runAll();
