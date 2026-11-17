# Pinned security backport for CVE-2026-112366

This repository temporarily uses the source reviewed in micromatch/picomatch PR #254
(commit c63a5bf4e61dbdb81bc41e97dc2616c30acce337) to address the repeated
extglob ReDoS vulnerability in picomatch <= 4.0.7.

The patch is not yet an official npm release. Version 4.0.8-iron.0 and the
internal package name are deliberate: they do NOT represent an upstream release.
The source is pinned verbatim to the public commit, with its MIT LICENSE.
The alias devDependency is mandatory to make npm ci install exactly the local
patched source; do not silently restore npm picomatch@4.0.7. Existing npm
audit remains enabled. The security regression requires that all test tooling
actually resolves to the local patched source, and hostile patterns complete
under a subprocess deadline.

The same 4.x matcher is used for the test-only micromatch v4 dependency,
normally backed by picomatch 2.x. This compatibility change must pass the
entire test/CI/browser/migration build matrix before merge. If it cannot,
revert and keep STOP-SHIP. Replace with an official patched release when one
is published and re-run the full matrix.
