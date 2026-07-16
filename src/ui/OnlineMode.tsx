// The whole online flow: setup (create / join a game), lobby (share the code,
// watch the seats fill, start), the live board, and every terminal screen —
// reusing GameScreen and Overlays so an online game looks and feels exactly
// like the local modes, from 2 up to 8 players.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Crown,
  Flag,
  Home as HomeIcon,
  Loader2,
  Play,
  Settings as SettingsIcon,
  Share2,
  Users,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Settings } from "@/game/settings";
import { useOnlineDuel } from "@/hooks/useOnlineDuel";
import type { OnlineErrorCode, OnlineSnapshot } from "@/online/client";
import {
  clearOnlineSession,
  loadOnlineSession,
  OnlineSession,
} from "@/online/session";
import {
  CODE_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  normalizeGameCode,
} from "@/online/protocol";
import { GameScreen } from "./GameScreen";
import { Overlays } from "./Overlays";
import { Panel } from "./screens/Panel";
import { Rules } from "./screens/Rules";
import { SettingsScreen } from "./screens/SettingsScreen";

export type OnlineIntent =
  | { type: "menu" }
  | { type: "join"; code: string }
  | { type: "resume" };

interface OnlineModeProps {
  settings: Settings;
  patchSettings: (patch: Partial<Settings>) => void;
  intent: OnlineIntent;
  onExit: () => void;
}

const ERROR_TEXT: Record<OnlineErrorCode, string> = {
  "not-found": "Code invalide ou partie introuvable.",
  full: "Cette partie est déjà complète.",
  started: "Cette partie a déjà commencé sans vous.",
  expired: "Cette partie a expiré ou est déjà terminée.",
  network: "Connexion impossible. Vérifiez votre réseau et réessayez.",
  corrupted: "La partie est corrompue et ne peut pas continuer.",
};

const Shell = ({
  onBack,
  children,
}: {
  onBack?: () => void;
  children: React.ReactNode;
}) => (
  <div className="app-bg flex min-h-[100dvh] flex-col items-center justify-center px-6 py-8 text-white">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        aria-label="Retour"
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"
      >
        <ArrowLeft size={18} />
      </button>
    )}
    <div className="w-full max-w-sm">{children}</div>
  </div>
);

export const OnlineMode = ({
  settings,
  patchSettings,
  intent,
  onExit,
}: OnlineModeProps) => {
  const online = useOnlineDuel();
  const { stage, snap } = online;
  const [panel, setPanel] = useState<
    "menu" | "rules" | "settings" | null
  >(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const session = useMemo(loadOnlineSession, []);
  const name = settings.playerName.trim() || "Joueur";

  useEffect(() => {
    import("@/online/firebase").then((m) =>
      setConfigured(m.isFirebaseConfigured())
    );
  }, []);

  // Dev-only introspection hook: the end-to-end tests read the live snapshot
  // to decide which (real) UI element to tap next. Stripped from prod builds.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __4c?: unknown }).__4c = { stage, snap };
    }
  });

  // Act on the entry intent exactly once. Auto-join only fires when a name
  // was already stored when we arrived — otherwise the setup screen (code
  // prefilled) collects it first, and a late auto-join must never race the
  // user's manual submission.
  const initialName = useRef(settings.playerName.trim());
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || configured === null) return;
    ran.current = true;
    if (!configured) return; // setup screen shows the notice
    if (intent.type === "resume" && session) {
      void online.resume(session);
    } else if (intent.type === "join" && initialName.current) {
      void online.join(intent.code, initialName.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // A dead resume target (a finished game cleaned up remotely) must not trap
  // the user in an error loop on next launch.
  useEffect(() => {
    if (
      stage.kind === "error" &&
      (stage.error === "not-found" || stage.error === "expired") &&
      intent.type === "resume"
    ) {
      clearOnlineSession();
    }
  }, [stage, intent.type]);

  if (stage.kind === "connecting") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="animate-spin text-amber-300" size={40} />
          <p className="text-lg font-semibold">{stage.label}</p>
        </div>
      </Shell>
    );
  }

  if (stage.kind === "error") {
    return (
      <Shell onBack={onExit}>
        <div className="space-y-4 text-center">
          <div className="text-4xl">😕</div>
          <h2 className="text-2xl font-extrabold">Oups</h2>
          <p className="text-white/70">{ERROR_TEXT[stage.error]}</p>
          <Button
            onClick={online.backToSetup}
            className="h-12 w-full bg-amber-300 font-bold text-slate-900 hover:bg-amber-200"
          >
            Réessayer
          </Button>
          <Button variant="secondary" onClick={onExit} className="w-full">
            Menu principal
          </Button>
        </div>
      </Shell>
    );
  }

  if (stage.kind === "setup" || !snap) {
    return (
      <OnlineSetup
        name={settings.playerName}
        players={settings.onlinePlayers}
        configured={configured}
        initialCode={intent.type === "join" ? intent.code : ""}
        session={session}
        onNameChange={(playerName) => patchSettings({ playerName })}
        onPlayersChange={(onlinePlayers) => patchSettings({ onlinePlayers })}
        onCreate={() =>
          void online.create(name, settings.scoreLimit, settings.onlinePlayers)
        }
        onJoin={(code) => void online.join(code, name)}
        onResume={(s) => void online.resume(s)}
        onBack={onExit}
      />
    );
  }

  // ---- Active game ----------------------------------------------------------

  if (snap.status === "lobby") {
    return (
      <OnlineLobby
        snap={snap}
        onStart={() => void online.startEarly()}
        onCancel={() => {
          void online.cancelLobby();
          onExit();
        }}
        onLeave={() => {
          online.leave();
          onExit();
        }}
      />
    );
  }

  if (snap.corrupted) {
    return (
      <Shell onBack={onExit}>
        <div className="space-y-4 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-2xl font-extrabold">Partie interrompue</h2>
          <p className="text-white/70">
            Les données de cette partie sont incohérentes (client modifié ou
            bug). Elle ne peut pas continuer.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              clearOnlineSession();
              onExit();
            }}
            className="w-full"
          >
            Menu principal
          </Button>
        </div>
      </Shell>
    );
  }

  const game = snap.game;
  if (!game) return null;

  return (
    <>
      <GameScreen
        game={game}
        aiThinking={false}
        dispatch={online.dispatch}
        duoLayout="pass"
        onToggleLayout={() => {}}
        onOpenMenu={() => setPanel("menu")}
        online={{
          mySeat: snap.mySeat,
          players: snap.players,
          connected: snap.connected,
          awaitingReveal: snap.awaitingReveal,
          busy: snap.busy,
          canClaimVictory: snap.canClaimVictory,
          onClaim: () => void online.claimVictory(),
          onExclude: (seat) => void online.excludePlayer(seat),
        }}
      />
      <Overlays
        game={game}
        onNextRound={online.nextRound}
        onNewGame={() => {}}
        onHome={() => {
          online.leaveFinished();
          onExit();
        }}
        online={{
          mySeat: snap.mySeat,
          result: snap.result,
          players: snap.players,
          myNextReady: snap.myNextReady,
          canClaimVictory: snap.canClaimVictory,
          onClaim: () => void online.claimVictory(),
          onExclude: (seat) => void online.excludePlayer(seat),
          onLeave: () => {
            online.leave();
            onExit();
          },
          rematchOffered: !!snap.rematchCode,
          rematchRequested: false,
          onRematch: () => void online.requestRematch(name),
          onJoinRematch: () => void online.joinRematch(name),
        }}
      />

      {panel === "menu" && (
        <Panel title="Menu" onClose={() => setPanel(null)}>
          <OnlineMenu
            gameLive={snap.status === "playing"}
            playerCount={snap.playerCount}
            onResume={() => setPanel(null)}
            onOpen={(p) => setPanel(p)}
            onAbandon={async () => {
              setPanel(null);
              await online.abandon();
              if (snap.playerCount > 2) {
                // The table plays on without me — nothing left to watch.
                online.leave();
                onExit();
              }
            }}
            onHome={() => {
              setPanel(null);
              online.leave();
              onExit();
            }}
          />
        </Panel>
      )}
      {panel === "rules" && (
        <Panel title="Comment jouer" onClose={() => setPanel("menu")}>
          <Rules />
        </Panel>
      )}
      {panel === "settings" && (
        <Panel title="Réglages" onClose={() => setPanel("menu")}>
          <SettingsScreen settings={settings} onChange={patchSettings} />
        </Panel>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Setup: create a game (choosing the table size) or join with a code
// ---------------------------------------------------------------------------

const OnlineSetup = ({
  name,
  players,
  configured,
  initialCode,
  session,
  onNameChange,
  onPlayersChange,
  onCreate,
  onJoin,
  onResume,
  onBack,
}: {
  name: string;
  players: number;
  configured: boolean | null;
  initialCode: string;
  session: OnlineSession | null;
  onNameChange: (n: string) => void;
  onPlayersChange: (n: number) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onResume: (s: OnlineSession) => void;
  onBack: () => void;
}) => {
  const [code, setCode] = useState(initialCode);
  const cleanCode = normalizeGameCode(code);
  const nameOk = name.trim().length > 0;
  const counts = Array.from(
    { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
    (_, i) => MIN_PLAYERS + i
  );

  return (
    <Shell onBack={onBack}>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-amber-300/15 text-amber-300 ring-1 ring-amber-300/30">
          <Wifi size={26} />
        </div>
        <h1 className="text-3xl font-black tracking-tight">Partie en ligne</h1>
        <p className="mt-1 text-white/70">
          De 2 à 8 joueurs, chacun sur son téléphone. Sans compte.
        </p>
      </div>

      {configured === false && (
        <div className="mb-4 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200 ring-1 ring-rose-400/30">
          Le mode en ligne n'est pas encore configuré (clés Firebase
          manquantes). Voir le README pour l'activer.
        </div>
      )}

      <div className="space-y-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">
            Votre nom
          </label>
          <Input
            value={name}
            maxLength={16}
            placeholder="Votre nom"
            onChange={(e) => onNameChange(e.target.value)}
            className="border-white/15 bg-white/10 text-white placeholder:text-white/40"
          />
        </div>

        {session && (
          <Button
            onClick={() => onResume(session)}
            variant="secondary"
            className="h-12 w-full text-base"
          >
            <Play className="mr-2" size={18} />
            Reprendre la partie en cours
          </Button>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">
            Nombre de joueurs
          </label>
          <div className="grid grid-cols-7 gap-1">
            {counts.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onPlayersChange(n)}
                aria-label={`${n} joueurs`}
                className={cn(
                  "rounded-lg py-2 text-sm font-bold transition-colors",
                  players === n
                    ? "bg-amber-300 text-slate-900"
                    : "bg-white/10 text-white/80 hover:bg-white/15"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={onCreate}
          disabled={!nameOk || configured === false}
          className="h-14 w-full bg-amber-300 text-base font-bold text-slate-900 hover:bg-amber-200"
        >
          Créer une partie
        </Button>

        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/10" />
          ou rejoignez avec un code
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="flex gap-2">
          <Input
            value={code}
            maxLength={CODE_LENGTH + 2}
            placeholder="CODE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="border-white/15 bg-white/10 text-center font-mono text-lg tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-white/40"
          />
          <Button
            onClick={() => onJoin(cleanCode)}
            disabled={
              !nameOk ||
              cleanCode.length !== CODE_LENGTH ||
              configured === false
            }
            className="h-10 shrink-0 bg-emerald-500 font-bold text-white hover:bg-emerald-600"
          >
            Rejoindre
          </Button>
        </div>
      </div>
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// Lobby: watch the seats fill up, share the invite, start
// ---------------------------------------------------------------------------

const OnlineLobby = ({
  snap,
  onStart,
  onCancel,
  onLeave,
}: {
  snap: OnlineSnapshot;
  onStart: () => void;
  onCancel: () => void;
  onLeave: () => void;
}) => {
  const [copied, setCopied] = useState(false);
  const code = snap.code;
  const link = `${location.origin}${location.pathname}?join=${code}`;
  const canShare = typeof navigator.share === "function";
  const seated = snap.players.length;
  const missing = snap.maxPlayers - seated;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the code is on screen anyway */
    }
  }, [link]);

  const share = useCallback(async () => {
    try {
      await navigator.share({
        title: "4 Columns — Partie en ligne",
        text: `Rejoins-nous pour une partie de 4 Columns ! Code : ${code}`,
        url: link,
      });
    } catch {
      /* user dismissed the sheet */
    }
  }, [code, link]);

  return (
    <Shell>
      <div className="space-y-5 text-center">
        <h1 className="text-2xl font-extrabold">
          {snap.isHost ? "Partie créée !" : "Vous y êtes !"}
        </h1>
        <p className="text-white/70">
          Partagez ce code avec les autres joueurs :
        </p>

        <div className="mx-auto rounded-2xl bg-white/5 px-6 py-4 ring-1 ring-amber-300/40">
          <span className="font-mono text-4xl font-black tracking-[0.25em] text-amber-300">
            {code}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={copy}
            variant="secondary"
            className="h-12 flex-1 text-sm"
          >
            {copied ? (
              <Check className="mr-2 text-emerald-400" size={18} />
            ) : (
              <Copy className="mr-2" size={18} />
            )}
            {copied ? "Copié !" : "Copier le lien"}
          </Button>
          {canShare && (
            <Button
              onClick={share}
              className="h-12 flex-1 bg-amber-300 text-sm font-bold text-slate-900 hover:bg-amber-200"
            >
              <Share2 className="mr-2" size={18} />
              Partager
            </Button>
          )}
        </div>

        {/* Seats */}
        <div className="space-y-1.5 rounded-2xl bg-white/5 p-3 text-left ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-white/60">
            <span className="flex items-center gap-1.5">
              <Users size={14} />
              Joueurs
            </span>
            <span>
              {seated}/{snap.maxPlayers}
            </span>
          </div>
          {snap.players.map((p) => (
            <div
              key={p.seat}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-sky-500/80 text-xs font-bold">
                {(p.name[0] || "?").toUpperCase()}
              </span>
              <span className="flex-1 truncate font-medium">
                {p.name}
                {p.isMe ? " (vous)" : ""}
              </span>
              {p.seat === 0 && (
                <Crown size={14} className="text-amber-300" aria-label="Hôte" />
              )}
            </div>
          ))}
          {Array.from({ length: missing }, (_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-white/40"
            >
              <Loader2 size={14} className="animate-spin text-amber-300/70" />
              En attente d'un joueur…
            </div>
          ))}
        </div>

        {snap.canStartEarly && (
          <Button
            onClick={onStart}
            className="h-12 w-full bg-emerald-500 text-base font-bold text-white hover:bg-emerald-600"
          >
            <Play className="mr-2" size={18} />
            Commencer à {seated} joueur{seated > 1 ? "s" : ""}
          </Button>
        )}

        <p className="text-xs text-white/50">
          {snap.isHost
            ? missing > 0
              ? "La partie démarre automatiquement quand tout le monde est là. Vous pouvez fermer l'application : la partie vous attendra."
              : "Tout le monde est là — lancement…"
            : "La partie démarre automatiquement quand tout le monde est là, ou dès que l'hôte la lance."}
        </p>

        {snap.isHost ? (
          <Button variant="secondary" onClick={onCancel} className="w-full">
            Annuler la partie
          </Button>
        ) : (
          <Button variant="secondary" onClick={onLeave} className="w-full">
            Quitter le salon (vous pourrez revenir)
          </Button>
        )}
      </div>
    </Shell>
  );
};

// ---------------------------------------------------------------------------
// In-game menu (online flavour: no "new game", but abandon)
// ---------------------------------------------------------------------------

const OnlineMenu = ({
  gameLive,
  playerCount,
  onResume,
  onOpen,
  onAbandon,
  onHome,
}: {
  gameLive: boolean;
  playerCount: number;
  onResume: () => void;
  onOpen: (p: "rules" | "settings") => void;
  onAbandon: () => void;
  onHome: () => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const item = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    danger = false
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium ring-1 ring-white/10 transition-colors hover:bg-white/10",
        danger ? "bg-white/5 text-rose-200" : "bg-white/5 text-white"
      )}
    >
      <span className="text-white/70">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      {item(<Play size={18} />, "Reprendre", onResume)}
      {item(<BookOpen size={18} />, "Règles", () => onOpen("rules"))}
      {item(<SettingsIcon size={18} />, "Réglages", () => onOpen("settings"))}
      {gameLive &&
        (confirming ? (
          <div className="space-y-2 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-400/30">
            <p className="text-sm text-rose-200">
              {playerCount > 2
                ? "Abandonner ? La partie continuera sans vous."
                : "Abandonner ? Votre adversaire remporte la partie."}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={onAbandon}
                className="flex-1 bg-rose-500 text-white hover:bg-rose-600"
              >
                Confirmer l'abandon
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirming(false)}
                className="flex-1"
              >
                Non
              </Button>
            </div>
          </div>
        ) : (
          item(
            <Flag size={18} />,
            "Abandonner la partie",
            () => setConfirming(true),
            true
          )
        ))}
      {item(
        <HomeIcon size={18} />,
        "Menu principal (partie conservée)",
        onHome,
        true
      )}
    </div>
  );
};
