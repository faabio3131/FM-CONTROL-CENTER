# Temporary, source-pinned picomatch security backports

**Not an upstream npm release.** These copies are source-for-source from public `micromatch/picomatch` review branches and are used only to mitigate CVE-2026-112366 until a maintained upstream release exists.

* v4: upstream commit `c63a5bf4e61dbdb81bc41e97dc2616c30acce337`, proposed patch PR #254. Original version 4.0.7; internal patched identifier 4.0.8-iron.0.
* v2: upstream commit `f03bec2c02e46f063fbfdc161aae1d0f854b2565`, proposed patch PR #246. Original version 2.3.2; internal patched identifier 2.3.3-iron.0.

MIT LICENSE preserved in each directory. Both upstream fixes are unmerged, so **do not declare upstream or formal production homologation** based on vendor presence alone. The IRON checkout service is unrelated to picomatch: these dependencies are used by development/lint/test tooling. Use security test with a subprocess deadline to prove the reported ReDoS shape cannot hang Node. Run full FMCC lint, typecheck, tests, PostgreSQL, F21, production build, audit and CI.

Never remove runtime audit, never use an unpinned external fork. Replace the vendored source with a patched official release as soon as one is available.
