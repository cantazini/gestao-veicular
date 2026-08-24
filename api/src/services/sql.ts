import sql, { type ConnectionPool, type Transaction } from "mssql";
import { getConfig } from "../config";

let poolPromise: Promise<ConnectionPool> | undefined;
let poolCreatedAt = 0;
const MAX_POOL_AGE_MS = 45 * 60 * 1000;

export async function getPool(): Promise<ConnectionPool> {
  if (poolPromise && Date.now() - poolCreatedAt < MAX_POOL_AGE_MS) return poolPromise;
  if (poolPromise) {
    const old = await poolPromise.catch(() => undefined);
    await old?.close().catch(() => undefined);
  }
  poolCreatedAt = Date.now();
  poolPromise = new sql.ConnectionPool(getConfig().sqlConnectionString).connect().catch((error) => {
    poolPromise = undefined;
    throw error;
  });
  return poolPromise;
}

export async function withTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

export { sql };
