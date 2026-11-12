// Storage layer. With a Firebase config in config.js, data is shared in Firestore
// (one document, realtime). Without it, falls back to localStorage (test mode).
import { FIREBASE_CONFIG } from './config.js';

const KEY = 'badminton-fund';
const empty = () => ({ members: [], expenses: [] });

function localStore() {
  let listener = () => {};
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || empty(); } catch { return empty(); } };
  return {
    mode: 'local',
    subscribe(onData, onStatus) { listener = onData; onStatus('Lưu trên máy'); onData(read()); },
    mutate(fn) {
      const s = read(); fn(s);
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
      listener(s);
    },
  };
}

async function firebaseStore() {
  const V = '10.12.2';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = initializeApp(FIREBASE_CONFIG);
  const db = fs.getFirestore(app);
  const ref = fs.doc(db, 'teams', 'main');
  let current = empty();
  let listener = () => {}, status = () => {};
  return {
    mode: 'firebase',
    subscribe(onData, onStatus) {
      listener = onData; status = onStatus;
      fs.onSnapshot(ref, { includeMetadataChanges: true }, snap => {
        current = snap.exists() ? snap.data() : empty();
        status(snap.metadata.hasPendingWrites ? 'Đang lưu…' : 'Đã đồng bộ ✓');
        listener(current);
      }, err => status('Lỗi kết nối: ' + err.code));
    },
    async mutate(fn) {
      // optimistic local update, then a transaction so concurrent edits don't clobber each other
      const local = structuredClone(current); fn(local); listener(local);
      status('Đang lưu…');
      try {
        await fs.runTransaction(db, async tx => {
          const snap = await tx.get(ref);
          const s = snap.exists() ? snap.data() : empty();
          s.members ||= []; s.expenses ||= [];
          fn(s);
          tx.set(ref, s);
        });
      } catch (e) {
        status('Lưu thất bại: ' + (e.code || e.message));
        listener(current);
        alert('Không lưu được, thử lại nhé. (' + (e.code || e.message) + ')');
      }
    },
  };
}

export const store = FIREBASE_CONFIG ? await firebaseStore() : localStore();
