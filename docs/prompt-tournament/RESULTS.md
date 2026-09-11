# Incant sketch completion tournament

Selected **P04 / Grok minimal**. Both Fable and Astra preferred it, narrowly. This is a practical default from a small empirical test, not proof of a universally best prompt.

## Method and results

Two Sol competitors, three independently prompted Grok Build subscription lanes, the existing Incant prompt and an adaptation of OpenAI's published drawing-to-image recipe competed. All seven ran on three identical synthetic freehand-style sketches. An intentionally composition-breaking control brought screening to 22 images. The top two ran twice each on two unseen sketches: eight final images, **30 successful image requests total**. All used gpt-image-2.5-flare, medium, 1024×1536. The model received the sketch image and exact spell plus frozen candidate instructions. No failed image attempts or selective retries occurred in the scored set.

Fable (claude-fable-5-1 through the existing Claude Code Max subscription) inspected all 30 comparison images and exact prompts. Astra independently inspected all eight finals. Grok lanes used the configured grok-heavy subscription route with served model grok-4.6-build; Sol lanes used gpt-5.6-sol. Raw private process logs are ignored; sanitized model receipts and image request receipts are retained.

| Candidate | Screening mean /100 | Final mean /100 |
|---|---:|---:|
| P04 Grok minimal | 90.67 | **92.25** |
| P07 Grok geometry | 89.83 | 90.13 |
| P06 Sol completion | 89.17 | — |
| P01 Grok render | 88.67 | — |
| P05 previous Incant | 88.17 | — |
| P03 published-recipe adaptation | 86.83 | — |
| P02 Sol fidelity | 86.67 | — |
| P08 intentionally unfaithful control | 25.00 | — |

Means are recalculated from Fable's numeric rubric fields, not copied from its prose arithmetic. Composition and proportions carry 55% of the score; subject identity/count/pose 20%, spell 15%, finish 10%. Major geometry failure caps a result at50. The negative control was detected and penalized despite its attractive rendering.

## What the evidence supports

P04's final boat results kept the main peaks, sun and sail arrangement slightly better. Both finalists still moved hulls upward and embellished the shore. Every screening candidate dropped the mug's overlapping handle. Prompts substantially constrain composition but do not guarantee exact geometry or every component. Keep the source sketch, support a new attempt, and test real owner sketches next.

The teapot fixture metadata described an open handle, but the actual sketch has no inner contour. Astra initially read it as an implied opening; Fable identified the ambiguity. Solid teapot handles are not counted as established failures. The original fixture and both reviews remain available so this correction is auditable.

The final margin is small with only two repeats per case; sampling variance may explain it. Screening grayscale stylistic judgments were also subjective. No pixel-registration metric, statistical significance, physical DC-1 test, or model-generalization claim is made. The selected production template matches frozen P04 when Live Paper is enabled and variation index is zero. Appearance-only variation instructions and disabling Live Paper are separate unscored settings.

## Artifacts

- [Frozen protocol](protocol.md), [candidate prompts](candidates.json), [computed scores](scores.json)
- [Fable screening](judge-screen/verdict.json), [Fable final](judge-final/verdict.json), [Astra review and reconciliation](astra-final.md)
- [Boat example](judge-final/P04-mountain-boat-2.png), [teapot example](judge-final/P04-walking-teapot-1.png)
- Every generated image has its exact applied prompt, request ID, elapsed time and input/output hashes in screen/, control/, or final/.

OpenAI publishes a [drawing-to-image prompting recipe](https://developers.openai.com/api/docs/guides/image-prompting#turn-a-drawing-into-a-realistic-image). We did not find a documented separate ChatGPT sketch-feature endpoint or its internal system prompt. The standard image editing API accepts the drawing itself; the recipe provides a public starting point, not access to ChatGPT's private orchestration.
