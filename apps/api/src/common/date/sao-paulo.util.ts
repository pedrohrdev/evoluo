// O fechamento de dia/período usa um fuso fixo do servidor —
// America/Sao_Paulo, para todos os participantes, independente do fuso de
// cada um (CLAUDE.md seção 2 "Outras regras já confirmadas"). Esta função é
// a única fonte da data "de hoje" usada para gravar registros diários —
// nunca aceitar essa data vinda do cliente é o que torna a edição
// retroativa inexpressável pela API (não precisa de nenhuma trava adicional
// além disso, ver docs/arquitetura-tecnica.md seção 4).
export function todayInSaoPaulo(referenceDate: Date = new Date()): string {
  // Formato 'en-CA' produz 'YYYY-MM-DD', que o Postgres aceita diretamente
  // para uma coluna `date`.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate);
}

export interface DateRange {
  periodStart: string;
  periodEnd: string;
}

// Semana e mês seguem o calendário civil (segunda a domingo; dia 1 ao
// último dia do mês) — nunca períodos relativos ao início do desafio
// (CLAUDE.md seção 2 "Metas"). A aritmética roda inteira em UTC sobre a
// data civil já resolvida por todayInSaoPaulo(), então não há risco de um
// deslocamento de fuso mudar em que dia da semana/mês "hoje" cai.
function toUtcDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function currentWeekRangeInSaoPaulo(referenceDate: Date = new Date()): DateRange {
  const today = toUtcDate(todayInSaoPaulo(referenceDate));
  // getUTCDay(): 0 = domingo ... 6 = sábado. (day + 6) % 7 mede a distância
  // até a segunda-feira anterior (0 quando hoje já é segunda).
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;

  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return { periodStart: toDateString(start), periodEnd: toDateString(end) };
}

export function currentMonthRangeInSaoPaulo(referenceDate: Date = new Date()): DateRange {
  const today = toUtcDate(todayInSaoPaulo(referenceDate));

  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  // Dia 0 do próximo mês é o último dia do mês atual.
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

  return { periodStart: toDateString(start), periodEnd: toDateString(end) };
}
