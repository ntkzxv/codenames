import { FieldPath } from "firebase-admin/firestore";
import type { GameStatus, PublicGame, Role, Team } from "@/lib/codenames";
import { otherTeam, shuffle } from "@/lib/codenames";
import { getAdminServices } from "@/lib/firebase/admin";
import wordBank from "@/data/words.json";

export const runtime = "nodejs";

const ROOM_CODE = "ROOM";
const errorResponse = (message: string, status = 400) => Response.json({ error: message }, { status });

async function verifyUser(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new Error("กรุณาเชื่อมต่อกับ Firebase ใหม่");
  const { auth } = getAdminServices();
  const token = await auth.verifyIdToken(header.slice(7));
  return token.uid;
}

function membership(room: PublicGame, uid: string) {
  return room.members?.[uid] === true;
}

export async function POST(request: Request) {
  try {
    const uid = await verifyUser(request);
    const body = await request.json() as {
      action?: string;
      code?: string;
      index?: number;
    };
    const { db } = getAdminServices();

    if (body.action === "create") {
      const code = ROOM_CODE;
      const roomRef = db.collection("rooms").doc(code);
      const room = await db.runTransaction(async (transaction) => {
        const roomSnapshot = await transaction.get(roomRef);
        const previous = roomSnapshot.exists ? roomSnapshot.data() as PublicGame : null;
        if (previous && previous.hostUid !== uid) throw new Error("ห้อง ROOM มี Spymaster คนอื่นดูแลอยู่");
        const nextRoom: PublicGame = {
          hostUid: uid,
          members: { ...(previous?.members ?? {}), [uid]: true },
          phase: "lobby",
          cards: [],
          startingTeam: null,
          turn: null,
          status: "lobby",
        };
        transaction.set(roomRef, nextRoom);
        transaction.set(roomRef.collection("secret").doc("key"), { spymasterUid: uid, roles: [] as Role[] });
        return nextRoom;
      });
      return Response.json({ code, room, view: "spymaster" });
    }

    const code = body.code?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code !== ROOM_CODE) return errorResponse("ห้องนี้ใช้ชื่อ ROOM");
    const roomRef = db.collection("rooms").doc(code);

    if (body.action === "join") {
      const snapshot = await roomRef.get();
      if (!snapshot.exists) return errorResponse("ไม่พบห้องนี้ ตรวจรหัสแล้วลองอีกครั้ง", 404);
      const room = snapshot.data() as PublicGame;
      await roomRef.update(new FieldPath("members", uid), true);
      const members = { ...room.members, [uid]: true };
      return Response.json({ code, room: { ...room, members }, view: "board" });
    }

    if (body.action === "resume") {
      const snapshot = await roomRef.get();
      if (!snapshot.exists) return errorResponse("ไม่พบห้องที่บันทึกไว้", 404);
      const room = snapshot.data() as PublicGame;
      if (room.hostUid !== uid) return errorResponse("ห้อง Spymaster นี้เปิดจากอุปกรณ์อื่น", 403);
      return Response.json({ code, room, view: "spymaster" });
    }

    if (body.action === "spy-key") {
      const [roomSnapshot, secretSnapshot] = await Promise.all([roomRef.get(), roomRef.collection("secret").doc("key").get()]);
      if (!roomSnapshot.exists || !secretSnapshot.exists) return errorResponse("ไม่พบเฉลยของห้องนี้", 404);
      const room = roomSnapshot.data() as PublicGame;
      const secret = secretSnapshot.data() as { spymasterUid: string; roles: Role[] };
      if (room.hostUid !== uid || secret.spymasterUid !== uid) return errorResponse("เฉลยแสดงได้เฉพาะ Spymaster ของห้อง", 403);
      return Response.json({ roles: secret.roles });
    }

    if (body.action === "start") {
      const txResult = await db.runTransaction(async (transaction) => {
        const [roomSnapshot, secretSnapshot] = await Promise.all([
          transaction.get(roomRef),
          transaction.get(roomRef.collection("secret").doc("key")),
        ]);
        if (!roomSnapshot.exists || !secretSnapshot.exists) throw new Error("ไม่พบห้องนี้");
        const room = roomSnapshot.data() as PublicGame;
        if (room.hostUid !== uid) throw new Error("เริ่มเกมได้จากจอ Spymaster เท่านั้น");
        if (room.phase === "playing") return room;
        const startingTeam: Team = Math.random() < 0.5 ? "red" : "blue";
        const roles = shuffle<Role>([
          ...Array<Role>(8).fill(startingTeam),
          ...Array<Role>(8).fill(otherTeam(startingTeam)),
          ...Array<Role>(8).fill("neutral"),
          "assassin",
        ]);
        const words = Object.values(wordBank as Record<string, string[]>).flat();
        const cards = shuffle(words).slice(0, 25).map((word) => ({ word, revealed: false, revealedRole: null }));
        const nextRoom: PublicGame = {
          hostUid: room.hostUid,
          members: room.members,
          phase: "playing",
          cards,
          startingTeam,
          turn: startingTeam,
          status: "playing",
        };
        transaction.set(roomRef, nextRoom);
        transaction.set(roomRef.collection("secret").doc("key"), { spymasterUid: uid, roles });
        return nextRoom;
      });
      return Response.json({ room: txResult });
    }

    if (body.action === "restart") {
      const snapshot = await roomRef.get();
      if (!snapshot.exists) return errorResponse("ไม่พบห้องนี้", 404);
      const room = snapshot.data() as PublicGame;
      if (room.hostUid !== uid) return errorResponse("เริ่มรอบใหม่ได้จากจอ Spymaster เท่านั้น", 403);
      const batch = db.batch();
      batch.set(roomRef, {
        hostUid: room.hostUid,
        members: room.members,
        phase: "lobby",
        cards: [],
        startingTeam: null,
        turn: null,
        status: "lobby",
      });
      batch.set(roomRef.collection("secret").doc("key"), { spymasterUid: uid, roles: [] as Role[] });
      await batch.commit();
      return Response.json({ ok: true });
    }

    if (body.action === "end-turn") {
      const snapshot = await roomRef.get();
      if (!snapshot.exists) return errorResponse("ไม่พบห้องนี้", 404);
      const room = snapshot.data() as PublicGame;
      if (!membership(room, uid)) return errorResponse("กรุณาเข้าห้องก่อน", 403);
      if (room.status !== "playing" || !room.turn) return errorResponse("เกมนี้จบแล้ว");
      const nextTeam = otherTeam(room.turn);
      await roomRef.update({ turn: nextTeam });
      return Response.json({ ok: true });
    }

    if (body.action === "reveal") {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0 || index >= 25) return errorResponse("เลือกการ์ดไม่ถูกต้อง");
      const outcome = await db.runTransaction(async (transaction) => {
        const secretRef = roomRef.collection("secret").doc("key");
        const [roomSnapshot, secretSnapshot] = await Promise.all([transaction.get(roomRef), transaction.get(secretRef)]);
        if (!roomSnapshot.exists || !secretSnapshot.exists) throw new Error("ไม่พบห้องนี้");
        const room = roomSnapshot.data() as PublicGame;
        const secret = secretSnapshot.data() as { spymasterUid: string; roles: Role[] };
        if (!membership(room, uid)) throw new Error("กรุณาเข้าห้องก่อน");
        if (room.status !== "playing" || !room.turn) throw new Error("เกมนี้จบแล้ว");
        if (room.cards[index]?.revealed) throw new Error("การ์ดใบนี้ถูกเปิดไปแล้ว");
        const role = secret.roles[index];
        if (!role) throw new Error("ไม่พบสีของการ์ด");
        const cards = room.cards.map((card, cardIndex) => cardIndex === index ? { ...card, revealed: true, revealedRole: role } : card);
        const next: Partial<PublicGame> = { cards };
        if (role === "assassin") {
          next.status = "assassin";
        } else if (role === room.turn) {
          const remains = secret.roles.some((candidate, cardIndex) => candidate === room.turn && !cards[cardIndex].revealed);
          if (!remains) next.status = `${room.turn}-won` as GameStatus;
        } else {
          next.turn = otherTeam(room.turn);
        }
        transaction.update(roomRef, next);
        return { role, status: next.status ?? "playing" };
      });
      return Response.json(outcome);
    }

    return errorResponse("ไม่รู้จักคำสั่งนี้");
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดกับ Firebase";
    const status = /สิทธิ์|เฉพาะ|เข้าห้อง|Spymaster|เชื่อมต่อ/.test(message) ? 403 : 500;
    return errorResponse(message, status);
  }
}
