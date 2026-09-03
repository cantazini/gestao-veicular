import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

if (!getApps().length) initializeApp();

export const adminAuth = getAuth();
export const firestore = getFirestore();
export const serverTimestamp = () => FieldValue.serverTimestamp();
