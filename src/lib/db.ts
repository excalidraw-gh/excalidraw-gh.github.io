// vite-project/src/lib/db.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { ExcalidrawSceneData } from './excalidrawScene';

const DB_NAME = 'githubPatStore';
const PAT_STORE_NAME = 'patStore';
const FILE_CACHE_STORE_NAME = 'fileCacheStore';
const PAT_KEY = 'githubPAT';

// 文件缓存数据结构
export interface CachedFileData {
  filePath: string;
  repoFullName: string;
  branch: string;
  content: ExcalidrawSceneData;
  lastModified: number; // 时间戳
  baseSnapshot?: string; // 远端/已保存版本的快照，用于恢复 dirty 状态
  originalSha?: string; // 原始文件的SHA，用于跟踪版本
}

interface MyDB extends DBSchema {
  [PAT_STORE_NAME]: {
    key: string;
    value: string;
  };
  [FILE_CACHE_STORE_NAME]: {
    key: string; // 格式: `${repoFullName}:${branch}:${filePath}`
    value: CachedFileData;
    indexes: {
      'repoAndBranch': [string, string]; // [repoFullName, branch]
    };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MyDB>(DB_NAME, 2, { // 增加版本号
      upgrade(db, oldVersion) {
        // 创建PAT存储
        if (!db.objectStoreNames.contains(PAT_STORE_NAME)) {
          db.createObjectStore(PAT_STORE_NAME);
        }
        
        // 创建文件缓存存储
        if (oldVersion < 2 && !db.objectStoreNames.contains(FILE_CACHE_STORE_NAME)) {
          const fileCacheStore = db.createObjectStore(FILE_CACHE_STORE_NAME);
          // 创建索引以便按仓库和分支查询
          fileCacheStore.createIndex('repoAndBranch', ['repoFullName', 'branch'], { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// PAT 相关函数
export async function savePat(pat: string): Promise<void> {
  const db = await getDb();
  await db.put(PAT_STORE_NAME, pat, PAT_KEY);
  console.log('PAT saved to IndexedDB');
}

export async function getPat(): Promise<string | undefined> {
  const db = await getDb();
  const pat = await db.get(PAT_STORE_NAME, PAT_KEY);
  console.log('PAT retrieved from IndexedDB:', pat ? 'found' : 'not found');
  return pat;
}

export async function deletePat(): Promise<void> {
  const db = await getDb();
  await db.delete(PAT_STORE_NAME, PAT_KEY);
  console.log('PAT deleted from IndexedDB');
}

// 文件缓存相关函数
function getCacheKey(repoFullName: string, branch: string, filePath: string): string {
  return `${repoFullName}:${branch}:${filePath}`;
}

export async function saveCachedFile(data: CachedFileData): Promise<void> {
  const db = await getDb();
  const key = getCacheKey(data.repoFullName, data.branch, data.filePath);
  await db.put(FILE_CACHE_STORE_NAME, data, key);
  console.log(`File cached: ${key}`);
}

export async function getCachedFile(
  repoFullName: string, 
  branch: string, 
  filePath: string
): Promise<CachedFileData | undefined> {
  const db = await getDb();
  const key = getCacheKey(repoFullName, branch, filePath);
  const cached = await db.get(FILE_CACHE_STORE_NAME, key);
  console.log(`File cache lookup for ${key}:`, cached ? 'found' : 'not found');
  return cached;
}

export async function deleteCachedFile(
  repoFullName: string, 
  branch: string, 
  filePath: string
): Promise<void> {
  const db = await getDb();
  const key = getCacheKey(repoFullName, branch, filePath);
  await db.delete(FILE_CACHE_STORE_NAME, key);
  console.log(`File cache deleted: ${key}`);
}

export async function getAllCachedFiles(
  repoFullName?: string, 
  branch?: string
): Promise<CachedFileData[]> {
  const db = await getDb();
  
  if (repoFullName && branch) {
    // 使用索引查询特定仓库和分支的缓存文件
    const index = db.transaction(FILE_CACHE_STORE_NAME).store.index('repoAndBranch');
    return await index.getAll(IDBKeyRange.only([repoFullName, branch]));
  } else {
    // 获取所有缓存文件
    return await db.getAll(FILE_CACHE_STORE_NAME);
  }
}

export async function clearCachedFiles(repoFullName?: string, branch?: string): Promise<void> {
  const db = await getDb();
  
  if (repoFullName && branch) {
    // 清除特定仓库和分支的缓存
    const cachedFiles = await getAllCachedFiles(repoFullName, branch);
    const tx = db.transaction(FILE_CACHE_STORE_NAME, 'readwrite');
    for (const file of cachedFiles) {
      const key = getCacheKey(file.repoFullName, file.branch, file.filePath);
      await tx.store.delete(key);
    }
    await tx.done;
    console.log(`Cleared cache for ${repoFullName}:${branch}`);
  } else {
    // 清除所有缓存
    await db.clear(FILE_CACHE_STORE_NAME);
    console.log('Cleared all file cache');
  }
}
