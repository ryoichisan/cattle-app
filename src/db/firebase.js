import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBxk5tTNZfNyuIbrH0oHkEsAIiJ0yhyAII",
  authDomain: "fujinote-b9936.firebaseapp.com",
  projectId: "fujinote-b9936",
  storageBucket: "fujinote-b9936.firebasestorage.app",
  messagingSenderId: "1099019647572",
  appId: "1:1099019647572:web:7955327e08112317de8bc1"
};

const app = initializeApp(firebaseConfig);
export const FDB = getFirestore(app);

// 農場IDの取得・設定
// ローカルストレージに保存された農場名を使用する
// 未設定の場合は入力を求める
function getFarmId() {
  let farmId = localStorage.getItem('FARM_ID');
  if (!farmId) {
    farmId = window.prompt(
      'この農場の名前を入力してください。\n（例：藤野農場、山田牧場など）\n\n※この名前はデータの識別に使用されます。'
    );
    if (!farmId || farmId.trim() === '') {
      alert('農場名が入力されていません。アプリを再度開いて農場名を入力してください。');
      farmId = '未設定農場_' + Date.now();
    }
    farmId = farmId.trim();
    localStorage.setItem('FARM_ID', farmId);
    alert('農場名「' + farmId + '」で設定しました。');
  }
  return farmId;
}

export const FARM_ID = getFarmId();
