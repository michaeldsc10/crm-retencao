import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB9HEWiHFc8YEuj_Ab-7TxGKqdQkSRQAio",
  authDomain: "assent-2b945.firebaseapp.com",
  projectId: "assent-2b945",
  storageBucket: "assent-2b945.firebasestorage.app",
  messagingSenderId: "851051401705",
  appId: "1:851051401705:web:fa6ebb1cc6ee5d3a737b78",
  measurementId: "G-K7F0F7PZ8M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
