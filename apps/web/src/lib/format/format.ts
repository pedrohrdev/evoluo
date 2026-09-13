export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateLong(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// Data com o dia da SEMANA por extenso ("segunda-feira, 14 de setembro").
//
// Existe por causa de um erro real na criação de um desafio: a pessoa
// combinou de começar "na segunda, dia 14", escolheu no seletor um dia
// vizinho e só percebeu quando o app liberou o check-in um dia antes —
// `<input type="date">` mostra 14/09 sem dizer que dia da semana é aquele,
// e a data de início não é editável depois. Mostrar o dia da semana torna
// o erro visível antes do envio.
export function formatWeekdayDateLong(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

const KIND_UNIT: Record<string, string> = {
  hours: "h",
  quantity: "un",
};

export function formatValueForKind(kind: string, value: number | null): string {
  if (value === null) return "—";
  const unit = KIND_UNIT[kind];
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

// Plural em pt-BR sem o "(s)" — que aparecia em cinco telas ("Faltam 2
// meta(s) diária(s)", "3 dia(s) concluído(s)", "12 registro(s)") e é a
// marca registrada de software que não teve tempo.
export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

// A data de HOJE no fuso fixo do produto (America/Sao_Paulo), não no fuso do
// navegador nem em UTC.
//
// O painel calculava "Dia N de 30" com `new Date().toISOString()`, que é
// UTC: das 21h à meia-noite (horário de Brasília) o contador adiantava um
// dia, e na véspera do início o desafio aparecia como já começado enquanto
// o backend ainda recusava o check-in. Todo fechamento de dia/período usa
// America/Sao_Paulo (CLAUDE.md seção 2), então a interface precisa usar o
// mesmo relógio.
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
