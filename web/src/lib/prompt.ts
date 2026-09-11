export type SpellPromptInput = {
  incantation: string;
  livePaper: boolean;
  variationIndex?: number;
};

export const SKETCH_RENDER_TEMPLATE =
  "Render this sketch into a finished image of the same drawing. The layout is locked: keep every subject's place, relative size, silhouette, pose, and count exactly as drawn. Do not replace it with a different picture of a similar subject.\n\nUse this instruction for materials, lighting, surface detail, and style: {{SPELL}}\n\nIf it names a specific change, alter only that and leave the rest as drawn. Read faint, doubled, or incomplete marks as the simplest complete forms already on the page; ignore stray ticks that do not form an object. Do not invent extra parts, objects, or scenery.";

const VARIATION_SHIFTS = [
  "",
  "Create a distinct variation: shift the lighting and time of day, keeping the same composition.",
  "Create a distinct variation: change materials and surface texture, keeping the same composition.",
  "Create a distinct variation: alter the mood and atmosphere, keeping the same composition.",
];

export function buildSpellPrompt(input: SpellPromptInput): string {
  const spell = input.incantation.trim();
  const shift =
    VARIATION_SHIFTS[input.variationIndex ?? 0] ?? VARIATION_SHIFTS[1];

  // P04: frozen empirical tournament candidate; see docs/prompt-tournament.
  const lines = [
    SKETCH_RENDER_TEMPLATE.replace(
      "{{SPELL}}",
      spell || "Choose a finish consistent with the drawn forms.",
    ),
  ];

  if (input.livePaper) {
    lines.push(
      "Use clear silhouettes and value contrast so the image remains legible on a grayscale display.",
    );
  }

  if (shift) lines.push(shift);

  return lines.join("\n");
}
