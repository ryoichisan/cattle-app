import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBxk5tTNZfNyuIbrH0oHkEsAIiJ0yhyAlI",
  authDomain: "fujinote-b9936.firebaseapp.com",
  projectId: "fujinote-b9936",
  storageBucket: "fujinote-b9936.firebasestorage.app",
  messagingSenderId: "1099019647572",
  appId: "1:1099019647572:web:7955327e08112317de8bc1"
};

const app = initializeApp(firebaseConfig);
export const fdb = getFirestore(app);

// 共有ファーム ID（同じ ID の端末同士が同期される）
export const FARM_ID = 'fujino-farm';
