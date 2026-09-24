/**
 * `pg` tip bildirimi yayınlamıyor; `@types/pg` onaylı bağımlılık listesinde
 * değil. Yalnız kullanılan dar yüzey burada bildirilir (repo kuralı:
 * `tests/config/node-child-process.d.ts` ile aynı yaklaşım).
 */
declare module "pg" {
  export interface QueryResult {
    readonly rows: unknown[];
    readonly rowCount: number | null;
  }

  export interface PoolConfig {
    readonly connectionString?: string;
  }

  /** T66 — tek transaction için havuzdan alınan istemci (dar yüzey). */
  export interface PoolClient {
    query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
    release(): void;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
    connect(): Promise<PoolClient>;
  }

  const pg: { readonly Pool: typeof Pool };
  export default pg;
}
