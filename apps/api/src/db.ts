import pg from "pg";

/**
 * T62 — `pg` havuz fabrikası. Bağlantı dizesi ortamdan gelir; sorgu değerleri
 * pg'ye parametre olarak geçirilir, SQL metni hiçbir zaman birleştirilmez.
 */

/** Sorgu sonucunun uygulamaya görünen dar yüzeyi. */
export interface DbQueryResult {
  readonly rows: unknown[];
  readonly rowCount: number | null;
}

/** Havuzun uygulamaya görünen dar yüzeyi; `app.ts` bu arayüze bağlanır. */
export interface Db {
  query(text: string, params?: readonly unknown[]): Promise<DbQueryResult>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  return {
    async query(text, params = []) {
      const result = await pool.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}
