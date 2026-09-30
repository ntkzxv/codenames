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
  const responseText = await response.text();
  let result: (T & { error?: string }) | null = null;

  if (responseText) {
    try {
      result = JSON.parse(responseText) as T & { error?: string };
    } catch {
      if (!response.ok) {
        throw new Error(`เซิร์ฟเวอร์มีปัญหา (HTTP ${response.status}) กรุณาตรวจ Function Logs ใน Vercel`);
      }
      throw new Error("เซิร์ฟเวอร์ส่งข้อมูลกลับมาไม่ถูกต้อง");
    }
  }

  if (!response.ok) {
    throw new Error(result?.error || `เซิร์ฟเวอร์มีปัญหา (HTTP ${response.status})`);
  }
  if (!result) throw new Error("เซิร์ฟเวอร์ไม่ได้ส่งข้อมูลกลับมา");
  return result;
}
