import { useEffect, useRef, type ReactNode } from "react";
import type { IncantSettings, ImageModel, ImageQuality } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  imageReady?: boolean;
  voiceReady?: boolean;
  settings: IncantSettings;
  onChange: (next: IncantSettings) => void;
  onClose: () => void;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[0.68rem] uppercase tracking-[0.2em] text-ash">
        {label}
      </p>
      {children}
      {hint ? (
        <p className="font-body text-sm italic text-ash">{hint}</p>
      ) : null}
    </div>
  );
}

export function Grimoire({
  open,
  settings,
  onChange,
  onClose,
  imageReady,
  voiceReady,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  const set = <K extends keyof IncantSettings>(
    key: K,
    value: IncantSettings[K],
  ) => onChange({ ...settings, [key]: value });

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      className="spellbook-dialog"
    >
      <div aria-label="Spellbook settings" className="w-full px-6 pb-8 pt-5">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/25" />
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-xl text-ink">Spellbook</h2>
          <button
            type="button"
            onClick={onClose}
            className="font-display text-[0.68rem] uppercase tracking-[0.2em] text-ash"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <Field
            label="OpenAI key"
            hint={
              imageReady
                ? "Image casting is connected through your server. No key needed here."
                : "Enter your key, or configure the server."
            }
          >
            <input
              id="openai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={settings.openaiKey}
              onChange={(e) => set("openaiKey", e.target.value)}
              placeholder="Enter API key"
              aria-label="OpenAI key"
              className="h-11 rounded-sm border border-ink/25 bg-parchment px-3 font-body text-base text-ink outline-none focus:border-ink"
            />
          </Field>

          <Field
            label="Gemini key"
            hint={
              voiceReady
                ? "Voice is connected through your server. No key needed here."
                : "Enter your Gemini key, or configure the server."
            }
          >
            <input
              id="gemini-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={settings.geminiKey}
              onChange={(e) => set("geminiKey", e.target.value)}
              placeholder="Enter API key"
              aria-label="Gemini key"
              className="h-11 rounded-sm border border-ink/25 bg-parchment px-3 font-body text-base text-ink outline-none focus:border-ink"
            />
          </Field>

          <Field
            label="Image model"
            hint="Flare is faster. Sunburst is slower and more precise."
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["gpt-image-2.5-flare", "Flare"],
                  ["gpt-image-2.5-sunburst", "Sunburst"],
                ] as [ImageModel, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("model", value)}
                  className={cn(
                    "h-11 rounded-sm border font-display text-[0.68rem] uppercase tracking-[0.16em] transition-transform duration-150 active:scale-[0.96]",
                    settings.model === value
                      ? "border-ink bg-ink text-parchment"
                      : "border-ink/25 bg-parchment text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Quality">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["medium", "Medium"],
                  ["high", "High"],
                ] as [ImageQuality, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set("quality", value)}
                  className={cn(
                    "h-11 rounded-sm border font-display text-[0.68rem] uppercase tracking-[0.16em] transition-transform duration-150 active:scale-[0.96]",
                    settings.quality === value
                      ? "border-ink bg-ink text-parchment"
                      : "border-ink/25 bg-parchment text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Toggle
            label="Room illustrations"
            hint="Books, a moonlit window, and a little encouragement in the margins."
            on={settings.chamber}
            onToggle={() => set("chamber", !settings.chamber)}
          />

          <Toggle
            label="Fourfold visages"
            hint="Cast four interpretations at once. The first to return becomes the large image; the rest wait as echoes. Slower, costs more."
            on={settings.fourfold}
            onToggle={() => set("fourfold", !settings.fourfold)}
          />

          <Toggle
            label="Compose for Live Paper"
            hint="Ask the model for strong value contrast so the result reads on a grayscale Daylight screen."
            on={settings.livePaper}
            onToggle={() => set("livePaper", !settings.livePaper)}
          />

          <p className="font-body text-sm leading-snug text-ash">
            Keys are stored in this browser. The app server forwards your image
            key, sketch, and spell to OpenAI, and your voice key to Google to
            open a listening session. Microphone audio goes to Gemini only while
            listening. Images use your API account and may incur charges.
          </p>
        </div>
      </div>
    </dialog>
  );
}

function Toggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-display text-[0.68rem] uppercase tracking-[0.2em] text-ash">
          {label}
        </p>
        <p className="mt-1 font-body text-sm italic text-ash">{hint}</p>
      </div>
      <button
        type="button"
        aria-label={label}
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={cn(
          "mt-1 h-7 w-12 shrink-0 rounded-full border border-ink/40 p-0.5 transition-colors duration-150",
          on ? "bg-ink" : "bg-parchment-deep",
        )}
      >
        <span
          className={cn(
            "block h-5 w-5 rounded-full bg-parchment transition-transform duration-150",
            on ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}
