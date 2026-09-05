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
