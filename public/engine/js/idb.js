export {loadSaveFiles,writeSaveFile} from '../save-store.js';

export function loadBios(key) {
    return new Promise((resolve, reject) => {
        const openReq = indexedDB.open("bios_roms");

        openReq.onerror = () => reject(`Failed to open IndexedDB for read, key ${key}`);

        openReq.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore("files", { keyPath: "key" });
        };

        openReq.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction(["files"]);

            tx.onerror = () => reject(`IndexedDB transaction error for key ${key}: ${tx.error}`);

            const objectStore = tx.objectStore("files");
            const getReq = objectStore.get(key);

            getReq.onerror = () => reject(`Failed to read from IndexedDB for key ${key}`);

            getReq.onsuccess = (event) => {
                const value = event.target.result;
                if (value && value["data"]) {
                    resolve(value["data"]);
                } else {
                    resolve(null);
                }
            };
        };
    });
}

/**
 * @param key {string}
 * @param bytes {Uint8Array}
 * @returns {Promise<void>}
 */
export function writeBios(key, bytes) {
    return new Promise((resolve, reject) => {
        const openReq = indexedDB.open("bios_roms");

        openReq.onerror = () => reject(`Failed to open IndexedDB for read, key ${key}`);

        openReq.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore("files", { keyPath: "key" });
        };

        openReq.onsuccess = (event) => {
            const db = event.target.result;
            const tx = db.transaction(["files"], "readwrite");

            tx.onerror = () => reject(`IndexedDB transaction error for key ${key}: ${tx.error}`);

            const objectStore = tx.objectStore("files");
            const putReq = objectStore.put({ key, data: bytes });

            putReq.onerror = () => reject(`Failed to write to IndexedDB for key ${key}`);

            putReq.onsuccess = () => resolve();
        };
    });
}