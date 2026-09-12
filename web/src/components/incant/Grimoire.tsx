import { useEffect, useRef } from "react";
import {
  MODEL_OPTIONS,
  QUALITY_OPTIONS,
  type IncantSettings,
} from "@/lib/settings";
type Props = {
  open: boolean;
  imageReady?: boolean;
  voiceReady?: boolean;
  settings: IncantSettings;
  onChange: (s: IncantSettings) => void;
  onClose: () => void;
  onReturnToDrawing?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSaveSketch?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
};
export function Grimoire({
  open,
  settings,
  onChange,
  onClose,
  imageReady,
  voiceReady,
  onReturnToDrawing,
  onUndo,
  onRedo,
  onSaveSketch,
  canUndo,
  canRedo,
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
      className="spellbook-dialog dragon-settings"
      aria-label="Dragon settings"
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="vellum-heading">
        <span className="wax-seal" aria-hidden="true">
          ✦
        </span>
        <div>
          <p className="eyebrow">KEPT BY THE DRAGON</p>
          <h2>The little book of spells</h2>
        </div>
        <button onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </header>
      <div className="settings-leaves">
        <fieldset>
          <legend>Your drawing</legend>
          <div className="settings-choices">
            {onReturnToDrawing && (
              <button onClick={onReturnToDrawing}>Return to my drawing</button>
            )}
            <button onClick={onUndo} disabled={!canUndo}>
              Undo ink
            </button>
            <button onClick={onRedo} disabled={!canRedo}>
              Redo ink
            </button>
            <button onClick={onSaveSketch} disabled={!onSaveSketch}>
              Save sketch
            </button>
          </div>
          <p>Your finished images stay in the spellbooks.</p>
        </fieldset>
        <fieldset>
          <legend>The wand’s voice</legend>
          <label>
            <input
              type="radio"
              name="voice-mode"
              checked={settings.voiceMode === "dictation"}
              onChange={() => set("voiceMode", "dictation")}
            />{" "}
            Dictate a spell
          </label>
          <p>Hold and release, or tap to start and tap to cast.</p>
          <label>
            <input
              type="radio"
              name="voice-mode"
              checked={settings.voiceMode === "conversation"}
              onChange={() => set("voiceMode", "conversation")}
            />{" "}
            Talk with the wand
          </label>
          <p>
            An OpenAI voice answers you. Talk naturally; say “cast it” or tap
            again when ready. Audio and your sketch go to OpenAI. This mode is
            experimental.
          </p>
        </fieldset>
        <fieldset>
          <legend>The owl’s errand</legend>
          <label>
            <input
              type="radio"
              name="owl-mode"
              checked={settings.owlMode === "direct"}
              onChange={() => set("owlMode", "direct")}
            />{" "}
            Straight to sharing
          </label>
          <label>
            <input
              type="radio"
              name="owl-mode"
              checked={settings.owlMode === "tray"}
              onChange={() => set("owlMode", "tray")}
            />{" "}
            Open the post tray first
          </label>
          <p>
            The parcel holds the finished image, its original sketch, and your
            spell. The post tray keeps opened letters and image replies.
          </p>
        </fieldset>
        <fieldset>
          <legend>The rendering spell</legend>
          <div className="settings-choices">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m}
                aria-pressed={settings.model === m}
                onClick={() => set("model", m)}
              >
                {m.endsWith("flare")
                  ? "Flare · swift"
                  : "Sunburst · considered"}
              </button>
            ))}
          </div>
          <div className="settings-choices">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q}
                aria-pressed={settings.quality === q}
                onClick={() => set("quality", q)}
              >
                {q === "high" ? "Finest detail" : "Everyday detail"}
              </button>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={settings.livePaper}
              onChange={(e) => set("livePaper", e.target.checked)}
            />{" "}
            Strong ink contrast for Daylight
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.fourfold}
              onChange={(e) => set("fourfold", e.target.checked)}
            />{" "}
            Four interpretations per cast
          </label>
          <p>Four images take more time and use more credit.</p>
        </fieldset>
        <details>
          <summary>Connections</summary>
          <p>
            {imageReady
              ? "Image casting is connected."
              : "Configure an image connection."}{" "}
            {voiceReady ? "Dictation is connected." : ""}
          </p>
          <label>
            OpenAI key
            <input
              type="password"
              autoComplete="off"
              value={settings.openaiKey}
              onChange={(e) => set("openaiKey", e.target.value)}
            />
          </label>
          <label>
            Gemini key
            <input
              type="password"
              autoComplete="off"
              value={settings.geminiKey}
              onChange={(e) => set("geminiKey", e.target.value)}
            />
          </label>
          <small>
            Leave these empty to use the server’s keys. Overrides stay in this
            browser.
          </small>
        </details>
      </div>
    </dialog>
  );
}
