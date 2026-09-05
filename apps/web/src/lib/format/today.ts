// Data local do navegador em YYYY-MM-DD, só para preencher o valor inicial
// de um <input type="date"> — a data que de fato vale para regras de
// negócio (fechamento de dia/período) é sempre a calculada pelo servidor
// em America/Sao_Paulo (docs/database-schema.md), nunca esta.
export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
