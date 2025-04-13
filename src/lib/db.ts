// vite-project/src/lib/db.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'githubPatStore';
const STORE_NAME = 'patStore';
const PAT_KEY = 'githubPAT';

interface MyDB extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: string;
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function savePat(pat: string): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, pat, PAT_KEY);
  console.log('PAT saved to IndexedDB');
}

export async function getPat(): Promise<string | undefined> {
  const db = await getDb();
  const pat = await db.get(STORE_NAME, PAT_KEY);
  console.log('PAT retrieved from IndexedDB:', pat ? 'found' : 'not found');
  return pat;
}

export async function deletePat(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, PAT_KEY);
  console.log('PAT deleted from IndexedDB');
}