# Incant empirical prompt tournament

Frozen product criterion: a fully rendered version of the input sketch, not a different composition.

Two independent Sol proposals, three independent Grok Build proposals, current Incant baseline, and an adaptation of the official OpenAI recipe. All receive identical images and user spells, gpt-image-2.5-flare, medium quality, 1024x1536, one result per screen case. Screening: three synthetic freehand-style sketches across architecture, creature, and still life. Top two proceed to two held-out cases, two repetitions each. At most 30 scored image calls including one deliberately unfaithful negative control, plus earlier app smoke. Preserve every attempted output/error. No cherry-picking retries.

Fable judge receives anonymous candidate IDs, initial sketch, full applied prompt/spell, and result pixels. Score 0–5 each: composition/placement (30%), proportions/silhouette (25%), core subject/count/pose (20%), spell fidelity (15%), finished rendering (10%). Major relocated/missing/replaced subject caps total at 50/100. Geometric fidelity wins ties. Report concrete visual evidence and uncertainty; never infer quality from prompt wording alone. Negative control must be penalized, otherwise judge validity is BLOCKED. Astra independently examines finalist triplets and resolves selection against product criteria.

This is a bounded comparative experiment, not proof of a universal best prompt or native/DC-1 performance. Synthetic inputs are not owner drawings. Prompt authors get no peer outputs. Provider wrappers record actual completion/model/usage where available.
