import { cn } from "@/lib/utils";

const MARKS = ["I", "II", "III", "IV", "V", "VI"] as const;

type Props = {
  images: string[];
  active: number;
  onSelect: (index: number) => void;
};

export function Echoes({ images, active, onSelect }: Props) {
  if (images.length < 2) return null;
  return (
    <div className="flex items-end justify-center gap-2 px-3">
      {images.map((src, i) => {
        const selected = i === active;
        return (
          <button
            key={`${i}-${src.slice(0, 24)}`}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Visage ${MARKS[i] ?? i + 1}`}
            className={cn(
              "overflow-hidden border bg-parchment-deep transition-transform duration-150 ease-out",
              "active:scale-[0.96]",
              selected
                ? "h-16 w-12 border-ink"
                : "h-12 w-9 border-ink/30 opacity-80",
            )}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
            <span className="sr-only">{MARKS[i] ?? i + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
