# Adversarial review triage 

Baseline 46a4faa, preserved as `incant-before-adversarial-2026-09-12`. Fable and Grok received independent copies of the same source and neutral archetype brief. Source-only lanes exclude credentials, saved user creations, Git history and unrelated data. This is logical independence, not strong filesystem sealing. Raw CLI receipts stay outside the repository; sanitized outcomes will be recorded here.

## Independently reproduced by keeper

| ID | Finding | Evidence | Disposition / owner |
| --- | --- | --- | --- |
| K1 | Owl cloud failure blocks native sharing of already-local images | keeper-baseline.json | Fix; Sol sharing |
| K2 | Semantic/accessibility click does not activate wand | keeper-baseline.json | Fix without double pointer/key activation; Sol input |
| K3 | Realtime close leaves startup promise pending after SDP, before channel open | keeper-baseline.json | Fix settle/cleanup races; Sol input |
| K4 | Simultaneous pen and touch on moon renews without saving unfinished stroke | keeper-palm.json (0 archive records and 0 draft strokes) | Priority fix; Sol input. Physical palm behavior remains unverified |
| K5 | Historical A recast overwrites unrelated unfinished B archive and misgroups generations | keeper-recast.json | Priority fix; Sol archive plus coordinated callsite integration |

Three Sol agents have disjoint primary file ownership. Input owns IncantApp and gesture/voice modules; archive owns persistence/library and proposes callsite contract changes to input; sharing owns owl/parcels/share helpers. Root owns adjudication, cross-boundary verification and release. No production data migration, deletion, real message sending or device mutation is authorized by the test plan.

## Reviewer status

Fable completed its final report through Claude Code Max, served `claude-fable-5-1`. Its first run timed out after 1,200 seconds of source inspection and tests; a finishing pass inspected the retained evidence and wrote a completed report. Its two failing adversarial assertions are reproduced defects, not failed test setup. Fable explicitly marks its other unexecuted hypotheses BLOCKED.

Grok completed a focused source-only final report, served `grok-4.6-build`, terminal `EndTurn`. Two preceding tool-driven runs ended `Cancelled` and are not treated as completed reviews. The final source packet contained IncantApp, native interactions, archive, OwlMail and RealtimeVoice in full. Grok ran no tests; keeper and Sol tests adjudicate its claims. No model or billing route was silently substituted.

See FABLE-REVIEW.md, GROK-REVIEW.md and reviewer-receipts.json. Raw reviewer reports are observations, not authoritative release judgments.

## Additional adjudication (implemented and verified)

| Reviewer item | Keeper decision | Action |
| --- | --- | --- |
| F1 palm on wand clips in-progress ink | Accept; corroborates K4 across frame controls | Sol input guards actual pen contact and preserves committed ink |
| F2 quota failure + reload overwrites newer sketch archive | Accept P1; reproduced storage failure | Durable editable draft plus hydration gate; release blocker until regression passes |
| F3 full-precision draft size | Accept measurement, not a DC-1 performance budget | Durable storage first; compact coordinates if safely subpixel |
| Fable H1 / Grok 2 typed spell erased on voice start | Source-confirmed | Preserve typed words until nonempty dictation; test silent/cancel paths |
| Fable H2 moon catches blank parchment | Reproduced both orientations | Tighten moon hit region; retain intentional painted owl/dragon intrusion |
| Fable H2 sketch-only archives inaccessible | Accept usability gap | View/save original in spellbooks without replacing current drawing |
| Fable H3 / Grok 5 cloud share prerequisite/fallback | Confirmed by K1 and source | Local files first, optional explicit reply link, no automatic parcel per cast |
| Fable H4 raw browser errors | Accept recovery gap | Actionable microphone/network message and typewriter fallback |
| Fable H5 no return/undo in immersive mode | Source-confirmed | Drawing controls inside dragon settings, not new room chrome |
| Fable cloud-cost: restore draft revisions and repeated hashing | Source-confirmed; arbitrary test latency oracle rejected | Retain sealed sources; collapse superseded unsealed restore revisions; safe incremental backup |
| Grok 1 connecting label promises cancellation but queues finishing | Accept inconsistency | Align connecting label with tap-to-finish contract and test it |
| Grok 3 archiveImage concurrent overwrite | Rejected with source and test evidence: get+put share one readwrite IDB transaction, overlapping scopes serialize | PASS: four simultaneous generations and a duplicate retain all four once |
| Grok 4 historical sketch typed recast disabled; voice cancel loses view | Accept source-confirmed | Use active source for enablement; restore selected creation after cancelled/empty voice |

## Release failure conditions

Any loss/reassignment of unrelated draft, generation, bundle or recovered content; stale or duplicate cast; active microphone after cancellation; palm touch triggering destructive controls during pen contact; local sharing dependent on optional cloud links; mismatched image/source/prompt; new context menus or broken native editing; inaccessible default controls; or a claim of hardware/provider verification without actual evidence blocks that claim. Reproduce negative controls before fixes and run full affected QA after integration. Inspect installed/deployed behavior separately from synthetic mocks.

## Integration gate 1 — FAIL (retained)

`qa-adversarial-final`: production build PASS; 14 unit/server contracts PASS; browser 84 PASS, 3 FAIL. The failures concern cast cancellation timing, blank-page lifecycle, and share readiness. These are being adjudicated and repaired before the final rerun. The owl failure observed a success notice before the asynchronous handoff response/finally completed; the corrected test waits for the button to become enabled before testing rapid duplicate activation. The first report/log remains retained. Source freezing overlapped the final MIME naming edit, so a fresh full profile is required after fixes.

The profile browser allowance increased from 240 to 480 seconds for expanded coverage. Individual scenario timeouts remain bounded. A failed browser test is not converted into a pass by the longer profile allowance.

## Integration repairs

The cancelled-cast scenario now holds the provider response behind a latch, uses a physical wand click to cancel, then releases the response and verifies no late result appears. Its earlier fixed-delay response could finish while Playwright waited for animated-control stability. The voice test now waits for the full moon lifecycle before capturing the blank page. A real product gap also closed: newPage immediately enters renewing and refuses new voice/cast work while durable flush and archive writes are pending. Both formerly failing scenarios pass independently.

Independent Sol review additionally found and fixed stale pen/pointer ownership after blur/hidden, synchronous duplicate share activation, JPEG/WebP filenames incorrectly ending in .png, and malformed fallback-envelope parsing hiding valid legacy drafts. Durable negative controls also prove simultaneous database/localStorage failure does not clear visible ink and still permits sketch download.

## Integration gate 2 — FAIL (retained)

`qa-adversarial-release`: production build PASS; 14 unit/server contracts PASS; browser 89 PASS, 1 FAIL. The remaining failure is the new wand-blur recovery scenario's initial listening assertion, before the blur itself. Its first useful evidence remains in the report/log. All three failures from gate 1 pass in this run. The test is under investigation, not waived.

The gate-2 failure was a precondition race: the new test drew before durable hydration unlocked the canvas, so no sketch existed and the wand correctly refused to start. The helper now waits for the enabled Dragon control (canvasReady), proves its stroke changed the canvas, and hovers the stable wand target before a physical press. The former failure passes 5 repeated runs; the full input file passes 11/11. Product source is unchanged by this repair. A fresh complete profile is running.

## Integration gate 3 — PASS

`qa-adversarial-verified`: production build PASS; 14 unit/server contracts PASS; all 90 browser scenarios PASS, no skipped/flaky cases. Final source hashes match the frozen product source; the gate includes the corrected hydration precondition and all added durable-storage/share tests. This proves the named synthetic repository scenarios, not physical pen latency, real palm rejection, or a complete device release certification.

The former stable source remains tagged `incant-before-adversarial-2026-09-12` at 46a4faa; the older owner-approved stable checkpoint/tag is unchanged. No server backup format or destructive database migration changed. Living storm clouds and story-style continuity remain deferred. Large-library pagination/performance measurement is recorded in LOOSE-ENDS.md.

Hosted deployment is complete. One real synthetic image cast passed in 12,516 ms with strike → fog → reveal ordering. The installed DC-1 app opened with its existing drawing intact; new dragon drawing controls were observed. Physical pen/palm, real speech and Android share-sheet verification remain manual/BLOCKED. See REPORT.md, deployment.json, hosted-check.json and infrastructure.json for final evidence and limits.
