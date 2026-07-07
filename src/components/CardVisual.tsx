import { cn } from "@/lib/utils";
import { getCardTheme } from "@/lib/cardColors";

// Original, self-drawn card visuals — no external images, no third-party
// artwork. Cards are pure CSS so they stay crisp at any size and add ~zero
// weight to the offline bundle.

interface CardFaceProps {
  value: number;
  className?: string;
}

export const CardFace = ({ value, className }: CardFaceProps) => {
  const { bg, fg } = getCardTheme(value);
  return (
    <div
      className={cn(
        "relative w-full h-full rounded-lg flex items-center justify-center select-none overflow-hidden",
        className
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {/* inner frame */}
      <div className="absolute inset-[3px] rounded-md bg-white/15" />
      <span className="absolute top-0.5 left-1 text-[9px] md:text-[11px] font-bold leading-none">
        {value}
      </span>
      <span className="relative text-lg md:text-2xl font-extrabold leading-none">
        {value}
      </span>
      <span className="absolute bottom-0.5 right-1 text-[9px] md:text-[11px] font-bold leading-none rotate-180">
        {value}
      </span>
    </div>
  );
};

interface CardBackProps {
  className?: string;
}

// Card back: four vertical bars — an original motif echoing the "4 Columns"
// name and the app icon.
export const CardBack = ({ className }: CardBackProps) => (
  <div
    className={cn(
      "w-full h-full rounded-lg flex items-center justify-center overflow-hidden",
      className
    )}
    style={{ background: "linear-gradient(135deg, #4A90E2, #3466a8)" }}
  >
    <div className="flex gap-[3px] md:gap-1">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-1.5 md:w-2 h-9 md:h-12 rounded-full bg-white/85"
        />
      ))}
    </div>
  </div>
);
