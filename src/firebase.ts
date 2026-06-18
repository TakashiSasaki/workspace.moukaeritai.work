import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write"
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseConfigData = firebaseConfig;

// Google Login Trigger using signInWithPopup supporting progress callback
export async function loginWithGoogle(onProgress?: (msg: string) => void) {
  try {
    if (onProgress) onProgress("1. Initiating Google Sign-In with popup...");
    const result = await signInWithPopup(auth, googleProvider);
    if (onProgress) onProgress("2. Google Sign-In with popup completed successfully.");
    return result.user;
  } catch (error: any) {
    console.error("Google Sign-In Error:", error);
    if (onProgress) {
      onProgress(`ERROR: Google Sign-In failed.`);
      if (error && typeof error === 'object') {
        onProgress(`Error Code: ${error.code || "unknown"}`);
        onProgress(`Error Message: ${error.message || String(error)}`);
        if (error.customData) {
          onProgress(`Error CustomData: ${JSON.stringify(error.customData)}`);
        }
      } else {
        onProgress(`Error: ${String(error)}`);
      }
    }
    throw error;
  }
}

// Logout Trigger
export async function logoutUser() {
  await signOut(auth);
}
