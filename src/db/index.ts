import { Context } from 'hono';
import { Env } from '../types';

export interface PreparedStatement {
  bind(...params: any[]): PreparedStatement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

export interface DatabaseAdapter {
  prepare(query: string): PreparedStatement;
  exec(query: string): Promise<any>;
}

let nodeDbInstance: DatabaseAdapter | null = null;

export function setNodeDb(db: DatabaseAdapter) {
  nodeDbInstance = db;
}

export function getNodeDb(): DatabaseAdapter | null {
  return nodeDbInstance;
}

export function getDb(c: Context<any>): DatabaseAdapter {
  if (c.env && (c.env as Env).DB) {
    return (c.env as Env).DB as unknown as DatabaseAdapter;
  }
  if (nodeDbInstance) {
    return nodeDbInstance;
  }
  throw new Error('Database not initialized');
}
