// Gera os efeitos sonoros locais do app (apps/web/public/sounds/*.wav) a
// partir de tons sintetizados — sem nenhuma dependência externa e sem
// baixar nenhum arquivo de terceiros (não há como/deve-se buscar áudio de
// fontes externas aqui). Rodar com: npm run generate:sounds -w apps/web.
//
// Cada evento tem uma assinatura sonora curta e discreta (Web Audio
// mentalmente, mas gerada offline em PCM 16-bit mono comum a qualquer
// navegador via <audio>).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_RATE = 44100;

interface ToneSpec {
  freq: number;
  durationMs: number;
  gain?: number;
  type?: "sine" | "triangle";
  delayMs?: number;
}

function renderTone(spec: ToneSpec, sampleRate: number): Float32Array {
  const { freq, durationMs, gain = 0.5, type = "sine" } = spec;
  const totalSamples = Math.floor((durationMs / 1000) * sampleRate);
  const attackSamples = Math.min(Math.floor(totalSamples * 0.12), Math.floor(sampleRate * 0.012));
  const releaseSamples = Math.min(Math.floor(totalSamples * 0.5), Math.floor(sampleRate * 0.08));
  const out = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * freq * t;
    const raw = type === "sine" ? Math.sin(phase) : Math.asin(Math.sin(phase)) / (Math.PI / 2);

    let envelope = 1;
    if (i < attackSamples) {
      envelope = i / attackSamples;
    } else if (i > totalSamples - releaseSamples) {
      envelope = (totalSamples - i) / releaseSamples;
    }

    out[i] = raw * gain * envelope;
  }

  return out;
}

// Mistura vários tons, cada um podendo começar em um delay diferente
// (permite notas em sequência ou sobrepostas), somando amplitudes.
function mixTones(specs: ToneSpec[], sampleRate = SAMPLE_RATE): Float32Array {
  const ends = specs.map((s) => Math.floor(((s.delayMs ?? 0) + s.durationMs) / 1000 * sampleRate));
  const totalSamples = Math.max(...ends) + Math.floor(sampleRate * 0.02);
  const out = new Float32Array(totalSamples);

  for (const spec of specs) {
    const rendered = renderTone(spec, sampleRate);
    const offset = Math.floor(((spec.delayMs ?? 0) / 1000) * sampleRate);
    for (let i = 0; i < rendered.length; i++) {
      const idx = offset + i;
      if (idx < out.length) out[idx] += rendered[i];
    }
  }

  // Evita clipping se os tons se sobrepuserem.
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  if (peak > 1) {
    for (let i = 0; i < out.length; i++) out[i] /= peak;
  }

  return out;
}

function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample * 1;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

// Uma assinatura sonora curta por evento — todas com menos de meio segundo,
// pensadas para nunca cansar mesmo ouvidas repetidamente ao longo do dia.
const SOUNDS: Record<string, ToneSpec[]> = {
  // Uma meta individual foi concluída: um "tick" único e neutro.
  "goal-complete": [{ freq: 880, durationMs: 90, gain: 0.35 }],
  // As 3 metas diárias bateram — dia concluído: duas notas subindo.
  "day-complete": [
    { freq: 659.25, durationMs: 120, gain: 0.4 },
    { freq: 987.77, durationMs: 180, gain: 0.42, delayMs: 100 },
  ],
  // Streak avançou (dia concluído já cobre isso via evento próprio, mas
  // este toca quando o número do streak sobe visivelmente na UI).
  "streak-up": [
    { freq: 523.25, durationMs: 90, gain: 0.35 },
    { freq: 783.99, durationMs: 140, gain: 0.4, delayMs: 70 },
  ],
  // Novo recorde de streak (maior streak histórico) — o mais celebratório,
  // ainda assim curto: um arpejo de 3 notas.
  "new-record": [
    { freq: 523.25, durationMs: 100, gain: 0.32, delayMs: 0 },
    { freq: 659.25, durationMs: 100, gain: 0.36, delayMs: 80 },
    { freq: 987.77, durationMs: 220, gain: 0.42, delayMs: 160 },
  ],
  // Ação inválida / erro: tom curto e grave, sem agressividade.
  error: [{ freq: 196, durationMs: 150, gain: 0.3, type: "triangle" }],
  // Criou ou entrou em um desafio: um "pop" neutro de confirmação.
  joined: [{ freq: 440, durationMs: 70, gain: 0.3 }],
};

const outDir = join(import.meta.dirname, "..", "public", "sounds");

for (const [name, specs] of Object.entries(SOUNDS)) {
  const samples = mixTones(specs);
  const wav = encodeWav(samples);
  writeFileSync(join(outDir, `${name}.wav`), wav);
  console.log(`generated ${name}.wav (${(wav.length / 1024).toFixed(1)} KB)`);
}
