import { DatabaseSync } from 'node:sqlite';
import { DatabaseAdapter, PreparedStatement } from './index';

export function createNodeSqliteAdapter(dbPath: string): DatabaseAdapter {
  const db = new DatabaseSync(dbPath);

  function makeStatement(query: string, boundParams: any[] = []): PreparedStatement {
    return {
      bind(...params: any[]): PreparedStatement {
        return makeStatement(query, params);
      },
      async first<T = any>(): Promise<T | null> {
        const stmt = db.prepare(query);
        const row = stmt.get(...boundParams) as T | undefined;
        return row ?? null;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        const stmt = db.prepare(query);
        const results = stmt.all(...boundParams) as T[];
        return { results };
      },
      async run(): Promise<{ success: boolean; meta?: any }> {
        const stmt = db.prepare(query);
        const info = stmt.run(...boundParams);
        return { success: true, meta: info };
      },
    };
  }

  return {
    prepare(query: string): PreparedStatement {
      return makeStatement(query);
    },
    async exec(query: string) {
      db.exec(query);
    },
  };
}
