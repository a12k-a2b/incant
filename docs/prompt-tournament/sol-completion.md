# Sol completion prompt rationale

This candidate frames generation as **rendering over a locked underdrawing**. The sketch is not merely a compositional reference: its marks become binding spatial evidence, described through concrete anchors such as centers, silhouette footprints, overlap order, crops, spacing, perspective cues, and negative spaces. The model is asked to attach finish and detail to those anchors rather than regenerate a cleaner semantic interpretation of the scene.

The instruction protects rough, awkward, and ambiguous marks because those are often the parts that make the output feel like the caster's own drawing. Ambiguity is resolved conservatively instead of becoming permission to delete, normalize, or redesign.

The spell normally controls appearance and elaboration. Explicit structural requests override preservation only for the named geometry, subject, or relationship, with the smallest edit needed; all unaffected anchors remain fixed. This supports commands such as “make the left tower twice as tall” without loosening the rest of the scene, while still permitting a broad scaffold change when the caster clearly asks for one.
