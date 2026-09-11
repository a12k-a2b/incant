# Moon, archive, and broader parchment — 2026-09-11

Tap the moon to preserve the current sketch, then turn through a 3.2-second night/dusk/dawn transition into a fresh page. Clearing occurs behind the dark part of the transition. Storage failure prevents clearing. Reduced-motion settings disable movement.

The independent IndexedDB archive preserves sealed cast sources and their generated images. Draft snapshots update after a 500ms pause; edits after a sealed cast create a new pair. Existing gallery casts with retained sketches are backfilled idempotently. Original gallery and vector draft storage remain intact.

Where showDirectoryPicker is available, the user chooses a folder with the browser's native permission dialog. Incant creates an Incant-<random identifier> subfolder and writes pair-0001-sketch.png, pair-0001-image.png, and pair-0001-spell.json. Repeated casts have numbered image suffixes. File writes are serialized and unchanged pairs skipped. Permission loss requires choosing the folder again; the moon does not clear on write failure. Browser-only backup is not the same as a file in Downloads and can be lost when site data is erased.

Browsers without folder access offer a ZIP download before starting a new page. Initiating a download cannot prove the user completed it; IndexedDB remains a recovery copy. Automatic visible Files export on physical DC-1 requires a hardware check. Multiple tabs editing the same draft simultaneously are not a supported archive workflow.

The owner supplied a blue outline on a private device screenshot. It guided a larger, more rectangular blank area and smaller illustrated corner clusters. No private device screenshot or real user sketch is included in this repository. Portrait alternatives are browser screenshots at 1184 × 1584: A rich frame, B balanced (selected), C open crop. B's canvas bounding area is approximately 19% larger than A; artwork overlaps part of the bounds. These are browser renders, not physical latency/palm-rejection evidence. Portrait and landscape use separately composed engraving assets.

Validation: build, unit contracts, browser flows through daylight-qa; exact source bytes, pair persistence/deduplication, old-gallery backfill, save-before-clear, folder denial, and quota failure. Browser folder tests use real OPFS handles but do not prove Android Files integration. No paid model call is necessary for this UI/archive change.

Release: Railway deployment 506595e5-548d-4843-a76b-436d0ce56ca8 SUCCESS. Repository profile passed (27 browser flows, 7 unit contracts). Final production build repeated after adding the landscape asset; landscape visually inspected. Hosted isolated-browser smoke passed with three visible controls.

## Named frame choices and playful recasting

`/?frame=big` selects Big Frame and `/?frame=balanced` selects Balanced Frame. The choice persists locally across ordinary launches. Both original portrait/landscape art and their broad-parchment successors remain available. Switching frames retains vector draft data; normalized points adapt to the selected canvas bounds.

Repeated typed or spoken spells use the same source sketch until the owner edits it or starts a new page. The archive retains each result and its words under that source pair, rather than replacing the previous rendition.

Physical DC-1 observation: the balanced deployment launched with the owner's vector sketch intact. Tapping the moon opened the save setup modal. The browser exposed showDirectoryPicker but its promise did not complete and no native picker appeared in the installed TWA. Added a 30-second timeout with ZIP fallback guidance; no claim of automatic Files export on this device. This is a live hardware limitation, despite desktop OPFS success. No private screenshot is committed.

Final deployment: 6e002b6f-6e76-4441-ad95-79fa621bf5e7 SUCCESS; hosted frame switching PASS. Updated profile: 30 browser tests and 7 unit contracts passed. Production build and visual moon preview repeated after feathering the transition edges. Final browser assets: index-BSx_ePgY.css / index-B6YQJAef.js.

Physical file evidence: /sdcard/Download/Incant-pairs.zip was present on the DC-1. A private temporary copy passed Python zipfile CRC validation. It contained six numbered sketch files, five generated-image files (including pair-0005-image-02.png), and six spell JSON files. This proves the ZIP export reached Downloads, not automatic directory writes. Private archive contents are not committed.
