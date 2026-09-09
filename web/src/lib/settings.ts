export const QUALITY_OPTIONS = ["medium", "high"] as const;
export type ImageQuality = (typeof QUALITY_OPTIONS)[number];

export const MODEL_OPTIONS = [
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
] as const;
export type ImageModel = (typeof MODEL_OPTIONS)[number];

export type IncantSettings = {
  openaiKey: string;
  geminiKey: string;
  fourfold: boolean;
  livePaper: boolean;
  chamber: boolean;
  quality: ImageQuality;
  model: ImageModel;
};

export const DEFAULT_SETTINGS: IncantSettings = {
  openaiKey: "",
  geminiKey: "",
  fourfold: false,
  livePaper: true,
  chamber: true,
  quality: "medium",
  model: "gpt-image-2.5-flare",
};

const STORAGE_KEY = "incant-grimoire-v1";

export function loadSettings(): IncantSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<IncantSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      quality: QUALITY_OPTIONS.includes(parsed.quality as ImageQuality)
        ? (parsed.quality as ImageQuality)
        : DEFAULT_SETTINGS.quality,
      model: MODEL_OPTIONS.includes(parsed.model as ImageModel)
        ? (parsed.model as ImageModel)
        : DEFAULT_SETTINGS.model,
      openaiKey: typeof parsed.openaiKey === "string" ? parsed.openaiKey : "",
      geminiKey: typeof parsed.geminiKey === "string" ? parsed.geminiKey : "",
      fourfold: Boolean(parsed.fourfold),
      livePaper: parsed.livePaper !== false,
      chamber: parsed.chamber !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: IncantSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length < 8) return trimmed ? "••••" : "";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
