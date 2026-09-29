"use client";

import { signInAnonymously } from "firebase/auth";
import type { User } from "firebase/auth";
import { getFirebaseClient } from "./client";

export async function ensureFirebaseUser(): Promise<User> {
  const { auth } = getFirebaseClient();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}

export async function roomRequest<T>(payload: Record<string, unknown>): Promise<T> {
  const user = await ensureFirebaseUser();
  const token = await user.getIdToken();
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "ส่งคำสั่งไม่สำเร็จ");
  return result;
}
