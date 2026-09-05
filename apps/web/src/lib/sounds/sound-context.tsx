"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SOUND_FILES, type SoundEvent } from "./manifest";

const ENABLED_KEY = "evoluo.sound-enabled";
const VOLUME_KEY = "evoluo.sound-volume";

interface SoundContextValue {
  enabled: boolean;
  volume: number;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  play: (event: SoundEvent) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

// Nunca toca nada sozinho ao carregar a página (autoplay seria bloqueado
// pelo navegador de qualquer forma, e não é o que queremos) — `play` só
// deve ser chamado a partir de um handler de interação do usuário (clique,
// tecla), nunca de um efeito disparado por navegação/carregamento.
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(0.5);
  const cache = useRef<Partial<Record<SoundEvent, HTMLAudioElement>>>({});

  useEffect(() => {
    // Mesma hidratação intencional pós-montagem que useAuth (localStorage
    // só existe no navegador) — os padrões acima já são o que o servidor
    // renderiza.
    try {
      const storedEnabled = window.localStorage.getItem(ENABLED_KEY);
      const storedVolume = window.localStorage.getItem(VOLUME_KEY);
      if (storedEnabled !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEnabledState(storedEnabled === "true");
      }
      if (storedVolume !== null) {
        setVolumeState(Number(storedVolume));
      }
    } catch {
      // localStorage indisponível (ex.: navegação privada) — segue com os padrões.
    }
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      window.localStorage.setItem(ENABLED_KEY, String(value));
    } catch {
      /* ignorado */
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(value);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(value));
    } catch {
      /* ignorado */
    }
  }, []);

  const play = useCallback(
    (event: SoundEvent) => {
      if (!enabled) return;
      let audio = cache.current[event];
      if (!audio) {
        audio = new Audio(SOUND_FILES[event]);
        cache.current[event] = audio;
      }
      audio.volume = volume;
      audio.currentTime = 0;
      // Reproduzir pode falhar silenciosamente se o navegador ainda não
      // registrou um "gesto do usuário" nesta sessão — não tratamos isso
      // como erro visível, é exatamente a política de autoplay funcionando.
      void audio.play().catch(() => {});
    },
    [enabled, volume],
  );

  const value = useMemo(() => ({ enabled, volume, setEnabled, setVolume, play }), [enabled, volume, setEnabled, setVolume, play]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound precisa estar dentro de <SoundProvider>.");
  return ctx;
}
