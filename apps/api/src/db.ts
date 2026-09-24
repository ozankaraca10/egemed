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
  /** T66 — içe aktarma `apply` tek transaction'da çalışır (E3 §d). */
  transaction<T>(work: (query: Db["query"]) => Promise<T>): Promise<T>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  const query: Db["query"] = async (text, params = []) => {
    const result = await pool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  };
  return {
    query,
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("begin", []);
        const result = await work((text, params = []) => client.query(text, params));
        await client.query("commit", []);
        return result;
      } catch (error) {
        try {
          await client.query("rollback", []);
        } catch {
          // Geri alma başarısız olsa bile asıl hata yükseltilir (ör. 23505).
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
