export type SpellPromptInput = {
  incantation: string;
  livePaper: boolean;
  variationIndex?: number;
};

const VARIATION_SHIFTS = [
  "",
  "Create a distinct variation: shift the lighting and time of day, keeping the same composition.",
  "Create a distinct variation: change materials and surface texture, keeping the same composition.",
  "Create a distinct variation: alter the mood and atmosphere, keeping the same composition.",
];

export function buildSpellPrompt(input: SpellPromptInput): string {
  const spell = input.incantation.trim();
  const shift = VARIATION_SHIFTS[input.variationIndex ?? 0] ?? VARIATION_SHIFTS[1];

  const lines = [
    "Turn this drawing into a complete, finished image.",
    "Preserve the exact layout, proportions, perspective, and placement of every element in the sketch.",
    "Treat the sketch as the compositional guide — do not invent new major subjects or rearrange the scene.",
    spell
      ? `The caster's spell (follow this for style, setting, materials, lighting, and extra detail):\n"""${spell}"""`
      : "Interpret the sketch faithfully. Choose plausible materials, lighting, and environment consistent with the drawing.",
    "Do not add text, watermarks, captions, or UI unless the spell explicitly asks for lettering.",
  ];

  if (input.livePaper) {
    lines.push(
      "Compose with strong value contrast, clear silhouettes, and readable shapes so the image holds up on a reflective grayscale display. Avoid relying on hue alone to separate forms.",
    );
  }

  if (shift) lines.push(shift);

  return lines.join("\n");
}
