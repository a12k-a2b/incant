# Sketch Magic rename

The September 2026 rename changes product-facing titles, onboarding, share copy,
new export filenames, PWA metadata, Android launcher labels, and the GitHub
repository to **Sketch Magic** (`a12k-a2b/sketch-magic`).

Compatibility identifiers intentionally remain unchanged: the Railway web origin,
Android package IDs and signing keys, browser storage/database names, backup
schemas, API/environment names, and existing archive directory metadata. This
keeps existing installations, saved sketches, generations, and links working.
Historical evidence retains its original names.

Experiment Lab's permanent path remains `apps/a12k-a2b/incant`; its manifest name
and Android label are Sketch Magic. DC Demos currently renders the permanent app
ID as the catalog title instead of the manifest display name. A maintainer must
add a display-name mapping for `a12k-a2b/incant` to `Sketch Magic`, preserving the
signing key, package ID and release history. Renaming the folder alone would
select another per-app signing key and is not an acceptable branding migration.

## Android publication

Experiment Lab commit `e7ea49de96e64fd423e61e67c5520ba1f7246e1a` passed
Android checks and the app-specific Publish APK job in
https://github.com/makedaylight/experiment-lab/actions/runs/35949762397 .
Published version: **26.9.24c**, Android version code **3**.
Local offline full checks were BLOCKED by an uncached AndroidX dependency;
CI supplied the complete Android check/build result. No physical-device rename
or fullscreen validation was performed in this change.

## Web verification

Production build PASS. Full browser run: 98/99 PASS, with the remaining test
expecting the old image alt label. After correcting that assertion, the targeted
recipient/share test PASS. Unit suite PASS (15/15) after updating its old server
startup-label assertion. No product behavior was changed to satisfy these checks.
Retained first-run evidence is in `docs/evidence/qa-sketch-magic-verified/`;
rerun logs are `sketch-magic-unit-check.log` and `sketch-magic-owl-recheck.log`.
An earlier sandboxed attempt could not open local test ports; it is not a product
failure. QA doctor passed with local networking/device access enabled.
