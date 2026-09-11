# Automatic spellbook — 2026-09-11

## Current behavior

The moon commits the current sketch to IndexedDB on the device, ends that parchment, and runs the night-to-dawn transition. It does not require folder permission, a download, or a network connection. A failed local commit keeps the canvas and presents a retry; optional Files mirroring failures cannot block the moon or a cast.

Draft snapshots save after a 500ms pause. Every cast saves its source before calling the provider, then appends each generated image with its words and timestamp. Editing a sealed source creates a new immutable source record under the same bundle ID. Only ending the page starts a new sketch bundle. Previous versions remain paired with their own generations.

## Data organization

Local creation day → session → sketch bundle → source revisions and their generations.

Each source record retains its numeric export pair ID, bundleId, sessionId, sessionStarted, created, updated, local day, PNG source, words, and generation records. Existing stores and records remain intact; optional metadata is compatible with old data. Known historical times are recovered from saved gallery entries; absent session/time information is labeled unknown rather than fabricated.

A new session begins after more than 45 minutes of inactivity when new sketch work starts; activity within that interval continues the same session. An existing sketch retains its original session even if edited later. A session may cross midnight; each new sketch is listed under its local creation day while keeping the shared session ID. Sessions are loose activity groups, not named events or user accounts.

`/?view=spellbook` opens the grouped local library. It includes sketches with no generations and all saved variations. The regular immersive screen remains unchanged.

## Optional Files export

Export spellbook in the desk dialog offers a ZIP or a browser folder picker. ZIP folders reflect day/session/bundle and preserve numbered source/image filenames and JSON metadata. Directory mirroring is optional and uses the prior flat numbered filenames. Chrome on the physical DC-1 exposed the directory API but did not open its picker in the TWA; a timeout recovers from that platform limitation.

A previous ZIP export was observed in DC-1 Downloads and its CRCs validated privately: six sketches, five generated images, six metadata files, including two generations for one sketch. No private archive or screenshot is committed.

Automatic storage is local app/site storage, not Railway cloud backup or a Files-folder guarantee. Clearing site data removes that local store. Cloud backup, cross-device recovery, named/mergeable sessions, and concurrent editing of one sketch in multiple tabs are not implemented.

## Validation

Browser tests cover commit-before-clear without a popup, optional folder write/denial/stall, local storage failure, immutable sources, multiple generations, old-data backfill, session inactivity, midnight grouping, and reload persistence. Synthetic browser evidence and real device ZIP evidence are distinct. Grouped-library preview uses synthetic cottage placeholders.

Earlier mandatory save-to-Files behavior is superseded: requiring that setup on every moon tap was the wrong default and has been removed.

Release: Railway 7a65cad0-28c4-4b2c-a25a-e7b5de504757 SUCCESS. Final repository profile passed (34 browser tests, seven contracts, production build). Hosted isolated-browser checks passed for moon-without-popup, 0.9 foreground opacity, direct typewriter focus, and named frame switching. Live hardware interaction was not driven during the owner's active drawing session.
