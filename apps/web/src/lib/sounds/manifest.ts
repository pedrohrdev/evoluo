// Arquivos gerados localmente por scripts/generate-sounds.ts — nenhum vem
// de uma fonte externa. Rodar `npm run generate:sounds` regenera todos.
export type SoundEvent = "goal-complete" | "day-complete" | "streak-up" | "new-record" | "error" | "joined";

export const SOUND_FILES: Record<SoundEvent, string> = {
  "goal-complete": "/sounds/goal-complete.wav",
  "day-complete": "/sounds/day-complete.wav",
  "streak-up": "/sounds/streak-up.wav",
  "new-record": "/sounds/new-record.wav",
  error: "/sounds/error.wav",
  joined: "/sounds/joined.wav",
};
