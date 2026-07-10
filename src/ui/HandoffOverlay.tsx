import { cn } from "@/lib/utils";

interface HandoffOverlayProps {
  /** Name of the player about to take their turn. */
  name: string;
  /** What the previous player just did (narrated for the incoming player). */
  summary: string | null;
  /** Extra instruction for the incoming player (e.g. setup guidance). */
  hint: string | null;
  /** The incoming player is on the round's final turn. */
  finalTurn: boolean;
  /** Overlay accepts the "continue" tap (board swap behind it is done). */
  ready: boolean;
  /** Overlay is fading out. */
  leaving: boolean;
  onContinue: () => void;
}

/**
 * Full-screen "passe le téléphone" interstitial. It is intentionally opaque:
 * the board flips to the incoming player's perspective *behind* it, so the
 * outgoing player's result stays on screen right up to the cover, and the
 * incoming player uncovers a board already facing them.
 */
export const HandoffOverlay = ({
  name,
  summary,
  hint,
  finalTurn,
  ready,
  leaving,
  onContinue,
}: HandoffOverlayProps) => (
  <div
    className={cn(
      "fixed inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-slate-950/95 px-6 text-white backdrop-blur-md",
      leaving ? "handoff-backdrop-leave" : "handoff-backdrop"
    )}
    role="button"
    aria-label={`Passe le téléphone à ${name}. Touche l'écran pour continuer.`}
    tabIndex={0}
    onClick={ready && !leaving ? onContinue : undefined}
    onKeyDown={
      ready && !leaving
        ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onContinue();
            }
          }
        : undefined
    }
  >
    <div className="animate-handoff-card flex flex-col items-center gap-4 text-center">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">
        Passe le téléphone
      </span>
      <div className="grid h-20 w-20 place-items-center rounded-full bg-sky-500/90 text-3xl font-extrabold shadow-[0_0_40px_-8px_rgba(56,189,248,0.8)]">
        {(name[0] || "?").toUpperCase()}
      </div>
      <h2 className="text-3xl font-extrabold">Au tour de {name}</h2>
      {finalTurn && (
        <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          Dernier tour !
        </span>
      )}
      {summary && (
        <p className="max-w-xs text-sm leading-relaxed text-white/70">
          {summary}
        </p>
      )}
      {hint && (
        <p className="max-w-xs text-sm leading-relaxed text-white/70">{hint}</p>
      )}
    </div>
    <span className="animate-tap-hint text-sm font-medium text-white/80">
      Touche l'écran pour continuer
    </span>
  </div>
);
