Future repeatable engineering scripts; current gates are npm scripts.

### Event transport budget

The shared non-secret constants in src/lib/config/qloo-budget.ts define a 15-second provider deadline, resolution concurrency two, and a 55-second verifier operation deadline. Five searches use at most three waves (45 seconds); with the 3-second body-read deadline this remains below 55 seconds and the unchanged route maxDuration of 60 seconds. Discovery/evaluation each allow two sequential provider calls (30 seconds plus body reading). Node 24 runs the verifier's type-free .ts constants through native type stripping. No retry is added. In proxy-required environments, start the local server using Node's authorized --use-env-proxy support; never commit proxy credentials. Stop on provider 429; do not run the verifier until manual live discovery/evaluation succeeds.
