export type OwlMissive = {
  subject: string;
  text: string;
};

const SUBJECTS = [
  "Owl post: one (1) captured enchantment",
  "A visage, still faintly humming",
  "Do not be alarmed — I have transfigured something",
  "From the parchment, with only mild recklessness",
  "Enclosed: a spell that actually worked (rare)",
  "Kindly receive this unauthorized miracle",
];

function pick(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return SUBJECTS[Math.abs(h) % SUBJECTS.length] ?? SUBJECTS[0];
}

export function composeOwlPost(incantation: string): OwlMissive {
  const spell = incantation.trim() || "an unnamed mutter I now slightly regret";
  const subject = pick(spell);
  const text = [
    "I drew a rather ordinary scribble and then, as one does, shouted a spell at it.",
    "",
    "The incantation was:",
    `« ${spell} »`,
    "",
    "The parchment, against several laws of taste and at least one of physics, obliged. Enclosed is the resulting visage. It may still smell of ozone and tea.",
    "",
    "If the owl looks smug, that is not my fault. Feed it a biscuit anyway.",
    "",
    "— dispatched from Sketch Magic, a wizard's canvas",
  ].join("\n");
  return { subject, text };
}

async function srcToFile(src: string): Promise<File | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const type = blob.type || "image/png";
    const ext = type.includes("jpeg") ? "jpg" : "png";
    return new File([blob], `sketch-magic-visage.${ext}`, { type });
  } catch {
    return null;
  }
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export type OwlFlight = "shared" | "mailed" | "cancelled";

export async function sendByOwl(opts: {
  imageSrc: string;
  incantation: string;
}): Promise<OwlFlight> {
  const { subject, text } = composeOwlPost(opts.incantation);
  const file = await srcToFile(opts.imageSrc);
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  try {
    if (
      file &&
      typeof nav.share === "function" &&
      nav.canShare?.({ files: [file] })
    ) {
      await nav.share({ title: subject, text, files: [file] });
      return "shared";
    }
    if (typeof nav.share === "function") {
      await nav.share({ title: subject, text });
      if (file) downloadFile(file);
      return "shared";
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return "cancelled";
    }
  }

  if (file) downloadFile(file);
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  window.location.href = mailto;
  return "mailed";
}
