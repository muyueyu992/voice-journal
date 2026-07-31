/* ============================================
   旅行手帐 - IndexedDB 存储
   ============================================ */
const DB_NAME = 'voice_journal_db';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_SETTINGS = 'settings';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

const Storage = {
  async getEntries() {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ENTRIES, 'readonly');
      const store = tx.objectStore(STORE_ENTRIES);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(req.result.sort((a, b) => new Date(b.date) - new Date(a.date)));
      };
      req.onerror = () => resolve([]);
      tx.oncomplete = () => db.close();
    });
  },

  async saveEntry(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readwrite');
      const store = tx.objectStore(STORE_ENTRIES);
      store.put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },

  async deleteEntry(id) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ENTRIES, 'readwrite');
      tx.objectStore(STORE_ENTRIES).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
    });
  },

  async getSettings() {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const req = tx.objectStore(STORE_SETTINGS).get('app');
      req.onsuccess = () => resolve(req.result?.value || { provider: 'zhipu', apiKey: '' });
      req.onerror = () => resolve({ provider: 'zhipu', apiKey: '' });
      tx.oncomplete = () => db.close();
    });
  },

  async saveSettings(settings) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      tx.objectStore(STORE_SETTINGS).put({ key: 'app', value: settings });
      tx.oncomplete = () => { db.close(); resolve(); };
    });
  }
};
