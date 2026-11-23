// Recently opened or saved projects, kept in this browser's IndexedDB (nothing leaves the machine). Each entry holds the
// whole project file so it can be reopened without the original file.

export const RECENT_LIMIT = 8
const DB_NAME = 'live-wire'
const STORE = 'recent-projects'

export const recentKey = (name) => name.trim().toLowerCase()

// The list after recording `entry`: newest first, one entry per project name, at most `limit` entries.
export function updateRecentList(list, entry, limit = RECENT_LIMIT) {
  const sorted = [entry, ...list.filter((item) => item.key !== entry.key)].sort((a, b) => b.savedAt - a.savedAt)
  return { kept: sorted.slice(0, limit), dropped: sorted.slice(limit) }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot store recent projects.'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, run) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const result = run(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(result?.result ?? result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('Storing the recent project was cancelled.'))
    })
  } finally {
    db.close()
  }
}

// Every recent project, newest first: `{ key, name, savedAt, size }` plus `data` (the serialized project) and, when the
// project has one, `handle`, the file it is saved to.
export async function listRecentProjects() {
  const entries = await withStore('readonly', (store) => store.getAll())
  return [...entries].sort((a, b) => b.savedAt - a.savedAt)
}

// `handle` undefined keeps the file already remembered for that project; null forgets it.
export async function rememberProject(name, data, handle, now = Date.now()) {
  const list = await listRecentProjects()
  const key = recentKey(name)
  const file = handle === undefined ? list.find((item) => item.key === key)?.handle : handle
  const entry = { key, name, data, savedAt: now, size: data.length, ...(file ? { handle: file } : {}) }
  const { dropped } = updateRecentList(list, entry)
  const store = (item) =>
    withStore('readwrite', (objects) => {
      objects.put(item)
      dropped.forEach((old) => objects.delete(old.key))
    })
  try {
    await store(entry)
  } catch (error) {
    // A browser that cannot store file handles still keeps the project itself.
    if (!entry.handle) throw error
    const plain = { ...entry }
    delete plain.handle
    await store(plain)
  }
}

export const forgetRecentProjects = () => withStore('readwrite', (store) => store.clear())
