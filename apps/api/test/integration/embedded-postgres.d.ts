// `embedded-postgres` declara só `exports` no package.json, sem `main` nem
// `types`. O tsconfig da API usa `moduleResolution: node` (clássico), que
// ignora `exports` e procura `main`/`types` — daí o "Cannot find module".
//
// Declarar a superfície mínima aqui é preferível a trocar o
// `moduleResolution` do projeto inteiro só por causa de uma dependência de
// teste: essa troca afetaria a resolução de TODOS os imports do backend em
// produção, um risco desproporcional ao problema.
declare module 'embedded-postgres' {
  export interface EmbeddedPostgresOptions {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent: boolean;
  }

  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
  }
}
