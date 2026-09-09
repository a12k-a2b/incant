import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  flying?: boolean;
  onClick: () => void;
};

export function OwlPost({ disabled, flying, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label="Send by owl"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-full",
        "bg-ink text-parchment",
        "shadow-[inset_0_0_0_1px_rgba(243,239,228,0.18)]",
        "transition-transform duration-150 ease-out active:scale-[0.94]",
        "disabled:opacity-30",
        flying && "owl-away",
      )}
    >
      <svg viewBox="0 0 48 48" className="size-8" aria-hidden fill="none">
        <circle
          cx="24"
          cy="24"
          r="22"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.35"
        />
        <path
          d="M16 20.5 C16 16.2, 19.2 13.2, 24 13.2 C28.8 13.2, 32 16.2, 32 20.5 C32 27.8, 28.4 33.5, 24 36.2 C19.6 33.5, 16 27.8, 16 20.5 Z"
          fill="currentColor"
        />
        <path d="M18.2 15.2 L16.4 11.8 L20.2 14.1" fill="currentColor" />
        <path d="M29.8 15.2 L31.6 11.8 L27.8 14.1" fill="currentColor" />
        <circle cx="20.6" cy="21.2" r="2.1" fill="#1a1814" />
        <circle cx="27.4" cy="21.2" r="2.1" fill="#1a1814" />
        <circle cx="21.1" cy="20.8" r="0.55" fill="currentColor" />
        <circle cx="27.9" cy="20.8" r="0.55" fill="currentColor" />
        <path d="M24 22.4 L22.4 24.6 L25.6 24.6 Z" fill="#1a1814" />
        <path
          d="M17.5 27.5 C19.8 29.8, 22 30.6, 24 30.6 C26 30.6, 28.2 29.8, 30.5 27.5"
          stroke="#1a1814"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
