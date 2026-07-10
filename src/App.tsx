import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useGame } from "./hooks/useGame";
import { loadSavedGame } from "./game/persistence";
import { loadSettings, saveSettings, Settings } from "./game/settings";
import { resetStats, loadStats, Stats } from "./game/stats";
import { setSoundEnabled, primeAudio } from "./lib/sound";
import { setHapticsEnabled } from "./lib/haptics";
import { Home } from "./ui/screens/Home";
import { GameScreen } from "./ui/GameScreen";
import { Overlays } from "./ui/Overlays";
import { Panel } from "./ui/screens/Panel";
import { Rules } from "./ui/screens/Rules";
import { StatsScreen } from "./ui/screens/StatsScreen";
import { SettingsScreen } from "./ui/screens/SettingsScreen";
import { Menu } from "./ui/screens/Menu";

type Screen = "home" | "game";
type PanelKind = "rules" | "stats" | "settings" | "menu" | null;

const AppInner = () => {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<Screen>("home");
  const [panel, setPanel] = useState<PanelKind>(null);
  // A game saved by a previous session (reload, PWA killed by the OS) can be
  // resumed exactly where it left off.
  const restored = useMemo(() => loadSavedGame(), []);
  const [started, setStarted] = useState(restored !== null);
  const [statsView, setStatsView] = useState<Stats>(() => loadStats());

  const { game, stats, aiThinking, dispatch, newGame, nextRound } = useGame(
    {
      mode: settings.mode,
      playerName: settings.playerName,
      player2Name: settings.player2Name,
      difficulty: settings.difficulty,
      scoreLimit: settings.scoreLimit,
    },
    restored
  );

  // The game uses a fixed dark "table" aesthetic; force the dark token set so
  // shadcn surfaces (dialogs, inputs, switches) match.
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Apply audio/haptics whenever settings change and persist them.
  useEffect(() => {
    setSoundEnabled(settings.sound);
    setHapticsEnabled(settings.haptics);
    saveSettings(settings);
  }, [settings]);

  // Keep the stats view fresh whenever the underlying stats change.
  useEffect(() => setStatsView(stats), [stats]);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const startNewGame = useCallback(() => {
    primeAudio();
    newGame({
      mode: settings.mode,
      playerName: settings.playerName,
      player2Name: settings.player2Name,
      difficulty: settings.difficulty,
      scoreLimit: settings.scoreLimit,
    });
    setStarted(true);
    setPanel(null);
    setScreen("game");
  }, [
    newGame,
    settings.mode,
    settings.playerName,
    settings.player2Name,
    settings.difficulty,
    settings.scoreLimit,
  ]);

  // Where the current sub-panel was opened from: closing Rules/Stats/Settings
  // returns to the in-game menu only when it was reached through that menu.
  const [panelOrigin, setPanelOrigin] = useState<"home" | "menu">("home");

  const openPanel = useCallback((p: PanelKind, origin: "home" | "menu") => {
    setStatsView(loadStats());
    setPanelOrigin(origin);
    setPanel(p);
  }, []);

  const closeSubPanel = useCallback(() => {
    setPanel(panelOrigin === "menu" ? "menu" : null);
  }, [panelOrigin]);

  const hasSavedGame =
    started && game.phase !== "gameOver";

  return (
    <>
      {screen === "home" ? (
        <Home
          name={settings.playerName}
          mode={settings.mode}
          player2Name={settings.player2Name}
          difficulty={settings.difficulty}
          hasSavedGame={hasSavedGame}
          onNameChange={(playerName) => patchSettings({ playerName })}
          onModeChange={(mode) => patchSettings({ mode })}
          onPlayer2NameChange={(player2Name) => patchSettings({ player2Name })}
          onDifficultyChange={(difficulty) => patchSettings({ difficulty })}
          onPlay={startNewGame}
          onResume={() => {
            primeAudio();
            setScreen("game");
          }}
          onOpen={(p) => openPanel(p, "home")}
        />
      ) : (
        <>
          <GameScreen
            game={game}
            aiThinking={aiThinking}
            dispatch={dispatch}
            duoLayout={settings.duoLayout}
            onToggleLayout={() =>
              patchSettings({
                duoLayout: settings.duoLayout === "pass" ? "face" : "pass",
              })
            }
            onOpenMenu={() => setPanel("menu")}
          />
          <Overlays
            game={game}
            onNextRound={nextRound}
            onNewGame={startNewGame}
            onHome={() => setScreen("home")}
          />
        </>
      )}

      {/* Panels */}
      {panel === "menu" && (
        <Panel title="Menu" onClose={() => setPanel(null)}>
          <Menu
            onResume={() => setPanel(null)}
            onNewGame={startNewGame}
            onOpen={(p) => openPanel(p, "menu")}
            onHome={() => {
              setPanel(null);
              setScreen("home");
            }}
          />
        </Panel>
      )}
      {panel === "rules" && (
        <Panel title="Comment jouer" onClose={closeSubPanel}>
          <Rules />
        </Panel>
      )}
      {panel === "stats" && (
        <Panel title="Statistiques" onClose={closeSubPanel}>
          <StatsScreen
            stats={statsView}
            onReset={() => setStatsView(resetStats())}
          />
        </Panel>
      )}
      {panel === "settings" && (
        <Panel title="Réglages" onClose={closeSubPanel}>
          <SettingsScreen settings={settings} onChange={patchSettings} />
        </Panel>
      )}
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <AppInner />
  </ErrorBoundary>
);

export default App;
