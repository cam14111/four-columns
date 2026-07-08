import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useGame } from "./hooks/useGame";
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
  const [started, setStarted] = useState(false);
  const [statsView, setStatsView] = useState<Stats>(() => loadStats());

  const { game, stats, aiThinking, dispatch, newGame, nextRound } = useGame({
    mode: settings.mode,
    playerName: settings.playerName,
    player2Name: settings.player2Name,
    difficulty: settings.difficulty,
  });

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
  ]);

  const openPanel = useCallback((p: PanelKind) => {
    setStatsView(loadStats());
    setPanel(p);
  }, []);

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
          onOpen={openPanel}
        />
      ) : (
        <>
          <GameScreen
            game={game}
            aiThinking={aiThinking}
            dispatch={dispatch}
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
            onOpen={(p) => openPanel(p)}
            onHome={() => {
              setPanel(null);
              setScreen("home");
            }}
          />
        </Panel>
      )}
      {panel === "rules" && (
        <Panel title="Comment jouer" onClose={() => setPanel(started ? "menu" : null)}>
          <Rules />
        </Panel>
      )}
      {panel === "stats" && (
        <Panel title="Statistiques" onClose={() => setPanel(started ? "menu" : null)}>
          <StatsScreen
            stats={statsView}
            onReset={() => setStatsView(resetStats())}
          />
        </Panel>
      )}
      {panel === "settings" && (
        <Panel title="Réglages" onClose={() => setPanel(started ? "menu" : null)}>
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
