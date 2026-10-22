// Borrador con fotos en IndexedDB (localStorage no aguanta blobs ni varios MB).
// Pensado para formularios con muchas fotos: si el teléfono cierra la pestaña
// al abrir la cámara, al volver se recupera lo capturado. Todo falla en
// silencio: sin IndexedDB (modo privado, etc.) el formulario sigue funcionando.
const DB_NAME = 'herco360_drafts';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('sin IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function idbGet(key) {
  try { return await run('readonly', (s) => s.get(key)); } catch (e) { return undefined; }
}
export async function idbSet(key, value) {
  try { await run('readwrite', (s) => s.put(value, key)); } catch (e) { /* sin espacio o sin IndexedDB */ }
}
export async function idbDel(key) {
  try { await run('readwrite', (s) => s.delete(key)); } catch (e) { /* nada que borrar */ }
}
