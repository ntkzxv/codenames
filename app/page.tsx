"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { firebaseConfigured, getFirebaseClient } from "@/lib/firebase/client";
import { ensureFirebaseUser, roomRequest } from "@/lib/firebase/client-api";
import type { PublicGame, Role, Team } from "@/lib/codenames";
import { otherTeam, teamName } from "@/lib/codenames";
import { sounds } from "@/lib/sound";
import { launchConfetti } from "@/lib/confetti";

type View = "spymaster" | "board";
type Session = { code: string; view: View };
const SESSION_KEY = "codenames-online-session-v1";

// Demo showcase cards for the lobby
const DEMO_HERO_CARDS = [
  { word: "สายลับ", role: "red", label: "แดง" },
  { word: "ดาวหาง", role: "blue", label: "น้ำเงิน" },
  { word: "หน้ากาก", role: "neutral", label: "พลเมือง" },
  { word: "รหัสลับ", role: "blue", label: "น้ำเงิน" },
  { word: "มือสังหาร", role: "assassin", label: "อันตราย" },
  { word: "เข็มทิศ", role: "red", label: "แดง" },
];

export default function Home() {
  const [room, setRoom] = useState<PublicGame | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [spyRoles, setSpyRoles] = useState<Role[]>([]);
  const [spyReady, setSpyReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() =>
    firebaseConfigured() ? "" : "กรุณาตั้งค่า Firebase ก่อนสร้างหรือเข้าห้องเกม"
  );

  // UI Enhancements
  const [soundOn, setSoundOn] = useState(() => sounds.enabled);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  function toggleSound() {
    const newState = sounds.toggle();
    setSoundOn(newState);
    if (newState) {
      sounds.playCardTap();
    }
  }

  async function run<T>(action: string, values: Record<string, unknown> = {}) {
    return roomRequest<T>({ action, code: roomCode, ...values });
  }

  function persistSession(session: Session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setRoomCode(session.code);
    setView(session.view);
  }

  // Restore session from URL or LocalStorage
  useEffect(() => {
    if (!firebaseConfigured()) return;
    let active = true;
    async function restore() {
      try {
        const query = new URLSearchParams(window.location.search);
        const urlCode = query.get("room")?.toUpperCase();
        const urlView = query.get("view");
        const saved = localStorage.getItem(SESSION_KEY);
        const session: Session | null =
          urlCode && urlView === "board"
            ? { code: urlCode, view: "board" }
            : saved
            ? (JSON.parse(saved) as Session)
            : null;
        if (!session) return;
        await ensureFirebaseUser();
        if (session.view === "spymaster") {
          await roomRequest({ action: "resume", code: session.code });
          if (!active) return;
          persistSession(session);
          setSpyReady(false);
        } else {
          const result = await roomRequest<{ room: PublicGame }>({
            action: "join",
            code: session.code,
          });
          if (!active) return;
          persistSession(session);
          setRoom(result.room);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "กลับเข้าห้องไม่สำเร็จ");
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  // Firebase Realtime Listener
  useEffect(() => {
    if (!roomCode || !view || !firebaseConfigured()) return;
    const { db } = getFirebaseClient();
    return onSnapshot(
      doc(db, "rooms", roomCode),
      (snapshot) => {
        if (snapshot.exists()) {
          const newRoom = snapshot.data() as PublicGame;

          // Audio & Fanfare trigger on status change
          if (newRoom.status !== prevStatusRef.current) {
            if (newRoom.status === "red-won") {
              sounds.playVictory();
              launchConfetti("red");
            } else if (newRoom.status === "blue-won") {
              sounds.playVictory();
              launchConfetti("blue");
            } else if (newRoom.status === "assassin") {
              sounds.playAssassinReveal();
            }
            prevStatusRef.current = newRoom.status;
          }

          setRoom(newRoom);
        }
      },
      (error) => setMessage(`เชื่อมต่อห้องไม่ได้: ${error.message}`)
    );
  }, [roomCode, view]);

  async function createRoom() {
    setBusy(true);
    setMessage("");
    try {
      await ensureFirebaseUser();
      const result = await roomRequest<{ code: string; room: PublicGame; view: View }>({
        action: "create",
      });
      persistSession({ code: result.code, view: result.view });
      setRoom(result.room);
      setSpyRoles([]);
      setSpyReady(false);
      sounds.playCardTap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้างห้องไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setBusy(true);
    setMessage("");
    try {
      const result = await roomRequest<{ code: string; room: PublicGame; view: View }>({
        action: "join",
        code: "ROOM",
      });
      persistSession({ code: result.code, view: "board" });
      setRoom(result.room);
      sounds.playCardTap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เข้าห้องไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function showSpyKey() {
    setBusy(true);
    setMessage("");
    try {
      const result = await run<{ roles: Role[] }>("spy-key");
      setSpyRoles(result.roles);
      setSpyReady(true);
      sounds.playCardTap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เปิด Key Card ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function startGame() {
    setBusy(true);
    setMessage("");
    try {
      const result = await run<{ room: PublicGame }>("start");
      setRoom(result.room);
      const key = await run<{ roles: Role[] }>("spy-key");
      setSpyRoles(key.roles);
      sounds.playCardTap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เริ่มเกมไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function revealCard(index: number) {
    if (busy || view !== "board") return;
    sounds.playCardTap();
    setBusy(true);
    setMessage("");
    try {
      const outcome = await run<{ role: Role; status: string }>("reveal", { index });
      if (outcome.role === "red" || outcome.role === "blue") {
        sounds.playTeamReveal(outcome.role);
      } else if (outcome.role === "neutral") {
        sounds.playNeutralReveal();
      } else if (outcome.role === "assassin") {
        sounds.playAssassinReveal();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เปิดการ์ดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function endTurn() {
    setBusy(true);
    setMessage("");
    try {
      await run("end-turn");
      sounds.playCardTap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "จบเทิร์นไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function restartRound() {
    setBusy(true);
    setMessage("");
    try {
      await run("restart");
      setRoom((current) =>
        current
          ? {
              ...current,
              phase: "lobby",
              status: "lobby",
              cards: [],
              turn: null,
            }
          : null
      );
      setSpyRoles([]);
      sounds.playCardTap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เริ่มรอบใหม่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copyBoardLink() {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}&view=board`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2500);
      sounds.playCardTap();
    } catch {
      setMessage(`รหัสเข้าห้อง: ${roomCode}`);
    }
  }

  const isSpy = view === "spymaster";
  const currentTurn = room?.turn ?? room?.startingTeam ?? "red";

  const gameOver = room?.status !== "playing" && room?.status !== "lobby" && room?.phase === "playing";
  const winner: Team | null =
    room?.status === "assassin"
      ? otherTeam(currentTurn)
      : room?.status === "red-won" || room?.status === "blue-won"
      ? (room.status.slice(0, -4) as Team)
      : null;

  // Common Header Bar
  const renderHeader = (subtitle?: string) => (
    <header className="topbar">
      <Link className="brand" href="/">
        <div className="brand-badge">C</div>
        <div>
          <div className="brand-title">
            CODENAMES<span className="brand-accent">.</span>TH
          </div>
          <div className="brand-sub">{subtitle ?? "เกมคำใบ้สายลับออนไลน์"}</div>
        </div>
      </Link>

      <div className="topbar-actions">
        <button
          className="icon-pill-btn"
          onClick={() => setShowRulesModal(true)}
          title="ดูกติกาการเล่น"
          type="button"
        >

          <span className="hidden sm:inline">วิธีเล่น</span>
        </button>

        <button
          className="icon-pill-btn"
          onClick={toggleSound}
          title={soundOn ? "ปิดเสียง" : "เปิดเสียง"}
          type="button"
        >
          <span className="font-bold font-mono text-xs">{soundOn ? "ON" : "OFF"}</span>
          <span className="hidden sm:inline">{soundOn ? "เสียงเปิด" : "ปิดเสียง"}</span>
        </button>

        <div className="status-beacon">
          <span className="beacon-dot" />
          <span className="hidden sm:inline">ระบบออนไลน์</span>
        </div>
      </div>
    </header>
  );

  // How to Play Rules Modal
  const renderRulesModal = () =>
    showRulesModal && (
      <div className="modal-overlay" onClick={() => setShowRulesModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h3 className="text-xl font-bold flex items-center gap-2 text-white">
               กติกาการเล่น Codenames
            </h3>
            <button
              className="text-gray-400 hover:text-white text-2xl leading-none"
              onClick={() => setShowRulesModal(false)}
            >
              ×
            </button>
          </div>

          <div className="py-4 space-y-4 text-sm text-gray-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
              <strong className="text-rose-400 block mb-1">เป้าหมายของเกม</strong>
              ช่วยกันเปิดการ์ดคำของทีมตัวเอง (แดง หรือ น้ำเงิน) ให้ครบก่อนอีกทีม โดยห้ามเปิดโดนมือสังหารเด็ดขาด!
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
              <strong className="text-amber-400 block mb-1">หน้าที่ Spymaster (จอเฉลย)</strong>
              เห็นสีของการ์ดทั้งหมด แล้วบอกคำใบ้กับทีมด้วยปากเปล่า
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
              <strong className="text-sky-400 block mb-1">หน้าที่ Operatives (จอกระดาน)</strong>
              ผู้เล่นในทีมคุยกันจากคำใบ้ แล้วแตะการ์ดบนกระดานร่วมกัน:
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-400">
                <li><span className="text-rose-400">การ์ดทีมเรา</span>: เล่นต่อได้จนกว่าจะจบเทิร์น</li>
                <li><span className="text-amber-200">การ์ดพลเมือง / ทีมตรงข้าม</span>: จบเทิร์นทันที</li>
                <li><span className="text-red-500 font-bold">การ์ดมือสังหาร (Assassin)</span>: แพ้เกมทันที!</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              <strong>คำแนะนำการเล่น 2 จอ:</strong> ใช้จอหนึ่งแสดง Key Card สำหรับ Spymaster และวางจอกระดานไว้ให้ทุกคนช่วยกันเล่น
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button
              className="btn-secondary"
              onClick={() => setShowRulesModal(false)}
            >
              เข้าใจแล้ว ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    );

  // 1. SCREEN: Initial Welcome / Lobby Screen
  if (!view || !room) {
    return (
      <main className="app-shell bg-espionage">
        {renderHeader("ห้องออนไลน์ · Two Screens")}

        <div className="flex-1 flex flex-col justify-center px-4 py-8 max-w-6xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

            {/* Left Column: Hero Copy & Actions */}
            <div className="lg:col-span-6 flex flex-col space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 w-max">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
                  REAL-TIME ESPIONAGE PARTY GAME
                </span>
              </div>

              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.15]">
                  คำเดียว <br />
                  <span className="bg-gradient-to-r from-rose-500 via-amber-400 to-sky-400 bg-clip-text text-transparent">
                    เสียวทั้งกระดาน
                  </span>
                </h1>
                <p className="mt-4 text-base sm:text-lg text-gray-400 leading-relaxed">
                  สัมผัสประสบการณ์บอร์ดเกม Codenames ภาษาไทยแบบ 2 จอ ซิงก์เรียลไทม์ผ่าน Firebase จอกระดานสำหรับทุกคน และจอเฉลยลับเฉพาะ Spymaster
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <button
                  className="btn-primary flex-1 text-base py-3.5"
                  onClick={createRoom}
                  disabled={busy || !firebaseConfigured()}
                >
                  <span>{busy ? "กำลังสร้างห้อง..." : "สร้างห้อง (จอ Spymaster)"}</span>
                  <span className="text-xl">→</span>
                </button>

                <button
                  className="btn-secondary flex-1 text-base py-3.5 border-sky-500/30 text-sky-200 hover:bg-sky-500/10"
                  onClick={() => void joinRoom()}
                  disabled={busy || !firebaseConfigured()}
                >
                  <span>เปิดจอกระดานผู้เล่น</span>

                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 pt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  <span>Spymaster ดู Key Card · ผู้เล่นคุยคำใบ้กันแล้วเปิดการ์ดบนกระดาน</span>
              </div>
            </div>

            {/* Right Column: Interactive 3D Card Showcase */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div className="w-full max-w-md p-6 rounded-3xl glass-panel-elevated relative overflow-hidden">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    ตัวอย่างการ์ดบนกระดาน
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300 font-mono">
                    25 CARDS
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 perspective-distant">
                  {DEMO_HERO_CARDS.map((demo, idx) => (
                    <div
                      key={idx}
                      className={`codename-card h-24 transition-all duration-300 ${
                        demo.role === "red"
                          ? "revealed role-red"
                          : demo.role === "blue"
                          ? "revealed role-blue"
                          : demo.role === "assassin"
                          ? "revealed role-assassin"
                          : "revealed role-neutral"
                      }`}
                    >
                      <span className="card-serial">#0{idx + 1}</span>
                      <span className="card-word-text">{demo.word}</span>
                      <span className="card-stamp">{demo.label}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
                  <span>รองรับทั้งคอมพิวเตอร์ ไอแพด และสมาร์ทโฟน</span>
                  <span className="text-emerald-400 font-medium">พร้อมเล่นทันที</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer */}
        <footer className="py-4 px-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-2">
          <div>CODENAMES THAI · เล่นพร้อมกันสองจอแบบเรียลไทม์</div>
          <div className="flex items-center gap-4">
            <span>Next.js 16 + Firebase Realtime</span>
            <span className="text-gray-700">|</span>
            <span>Room Mode</span>
          </div>
        </footer>

        {renderRulesModal()}
        {message && (
          <div className="toast-bar text-rose-300 border-rose-500/30">
            <span>{message}</span>
            <button className="text-white/70 hover:text-white" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
      </main>
    );
  }

  // 2. SCREEN: Spymaster Gate / Privacy Passcode Screen
  if (isSpy && !spyReady) {
    return (
      <main className="app-shell bg-espionage flex items-center justify-center p-4">
        {renderHeader("Spymaster Screen")}

        <div className="w-full max-w-lg p-8 sm:p-10 rounded-3xl glass-panel-elevated text-center my-auto relative">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 p-0.5 shadow-xl shadow-rose-500/20">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-3xl">
              SPY
            </div>
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase tracking-wider mb-3">
            TOP SECRET · ROOM {roomCode}
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">
            จอเฉลย <span className="text-rose-500">Spymaster</span>
          </h2>

          <p className="text-sm text-gray-300 leading-relaxed mb-6">
            จอนี้สำหรับ Spymaster ทั้งสองทีมใช้ร่วมกันเท่านั้น <br />
            <span className="text-amber-300 font-semibold">
              ห้ามให้ผู้เล่นที่อยู่หน้าจอกระดานแอบดูเด็ดขาด!
            </span>
          </p>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-6 flex items-center justify-between text-left">
            <div>
              <div className="text-xs text-gray-400">รหัสห้องสำหรับจอกระดาน</div>
              <div className="text-2xl font-black font-mono tracking-widest text-amber-400">
                {roomCode}
              </div>
            </div>
            <button className="btn-secondary text-xs py-2 px-3" onClick={copyBoardLink}>
              {copiedToast ? "คัดลอกแล้ว!" : "คัดลอกลิงก์กระดาน"}
            </button>
          </div>

          <button
            className="btn-primary w-full py-4 text-base"
            onClick={showSpyKey}
            disabled={busy}
          >
            <span>{busy ? "กำลังโหลด Key Card..." : "เปิดดู Key Card ของเกม"}</span>
            <span>→</span>
          </button>
        </div>

        {renderRulesModal()}
        {message && (
          <div className="toast-bar text-rose-300 border-rose-500/30">
            <span>{message}</span>
            <button className="text-white/70 hover:text-white" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
      </main>
    );
  }

  // 3. SCREEN: Room Waiting Screen (Phase === 'lobby')
  if (room.phase === "lobby") {
    return (
      <main className="app-shell bg-espionage flex flex-col justify-center items-center p-4">
        {renderHeader(isSpy ? "ห้อง Spymaster" : "จอกระดานผู้เล่น")}

        <div className="w-full max-w-xl p-8 sm:p-10 rounded-3xl glass-panel-elevated text-center my-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">
            {isSpy ? "KEY" : "LIVE"}
          </div>

          <div className="text-xs font-bold tracking-widest text-amber-400 uppercase mb-2">
            ROOM {roomCode} · {isSpy ? "SPYMASTER HOST" : "SHARED BOARD"}
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
            {isSpy ? "ห้องเกมพร้อมแล้ว" : "รอ Spymaster สับการ์ดและเริ่มเกม"}
          </h2>

          <p className="text-sm text-gray-400 leading-relaxed mb-6 max-w-md mx-auto">
            {isSpy
              ? "ส่งรหัสห้องหรือลิงก์ด้านล่างให้จอผู้เล่นเปิดไว้ จากนั้นกดเริ่มเกมเมื่อพร้อม"
              : "จอนี้คือกระดานกลางสำหรับทุกคน เมื่อ Spymaster เริ่มเกม กระดานคำ 25 คำจะปรากฏขึ้นอัตโนมัติ"}
          </p>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 max-w-sm mx-auto mb-6">
            <span className="text-xs text-gray-400 block mb-1">รหัสห้อง (ROOM CODE)</span>
            <div className="text-3xl font-black font-mono tracking-widest text-amber-400 py-1">
              {roomCode}
            </div>
            <button
              className="text-xs text-sky-400 hover:text-sky-300 underline mt-2 block mx-auto"
              onClick={copyBoardLink}
            >
              {copiedToast ? "คัดลอกลิงก์กระดานแล้ว!" : "คลิกเพื่อคัดลอกลิงก์จอกระดาน"}
            </button>
          </div>

          {isSpy ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <button
                className="btn-secondary flex-1 py-3"
                onClick={copyBoardLink}
              >
                <span>{copiedToast ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</span>
              </button>
              <button
                className="btn-primary flex-1 py-3"
                onClick={startGame}
                disabled={busy}
              >
                <span>{busy ? "กำลังเริ่มเกม..." : "เริ่มเกมเดี๋ยวนี้"}</span>
                <span>→</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-sm text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>กำลังเชื่อมต่อกับ Spymaster...</span>
            </div>
          )}
        </div>

        {renderRulesModal()}
        {message && (
          <div className="toast-bar text-rose-300 border-rose-500/30">
            <span>{message}</span>
            <button className="text-white/70 hover:text-white" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
      </main>
    );
  }

  // 4. SCREEN: Active Gameplay (Playing Phase)
  return (
    <main
      className={`app-shell bg-espionage flex flex-col h-screen overflow-hidden ${
        isSpy ? "spymaster-mode" : "board-mode"
      }`}
    >
      {/* Main Playing Field */}
      <div className="flex-1 flex flex-col min-h-0 px-2 sm:px-4 pt-2 pb-24 max-w-[1700px] mx-auto w-full">

        {/* Shared 5×5 game board */}
        <div className="flex-1 flex min-h-0 gap-5 items-stretch">

          {/* 5x5 Board Grid Container */}
          <div className="board-container flex-1 min-h-0">
            <div className="board-grid-5x5">
              {room.cards.map((card, index) => {
                const isRevealed = card.revealed;
                const revealedRole = card.revealedRole;
                const secretRole = isSpy ? spyRoles[index] : null;

                let cardClass = "codename-card ";
                if (isRevealed) {
                  cardClass += `revealed role-${revealedRole} `;
                } else {
                  cardClass += "unrevealed ";
                  if (secretRole) {
                    cardClass += `spy-peek-${secretRole} `;
                  }
                }

                return (
                  <div key={`${card.word}-${index}`} className="card-wrapper">
                    <button
                      type="button"
                      className={cardClass}
                      onClick={() => void revealCard(index)}
                      disabled={isSpy || gameOver || isRevealed || busy}
                      aria-label={`${card.word} ${isRevealed ? `เปิดแล้ว (${revealedRole})` : ""}`}
                    >
                      <span className="card-serial">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <span className="card-word-text">{card.word}</span>

                      {/* Revealed stamp */}
                      {isRevealed && (
                        <span className="card-stamp">
                          {revealedRole === "red" && "ทีมแดง"}
                          {revealedRole === "blue" && "ทีมน้ำเงิน"}
                          {revealedRole === "neutral" && "พลเมือง"}
                          {revealedRole === "assassin" && "มือสังหาร"}
                        </span>
                      )}

                      {/* Spymaster Peek Tag */}
                      {!isRevealed && secretRole && (
                        <span className="spy-tag">
                          {secretRole === "red" && "R"}
                          {secretRole === "blue" && "B"}
                          {secretRole === "neutral" && "N"}
                          {secretRole === "assassin" && "X"}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>
      <div className="floating-dock">
        <div className="flex items-center gap-3" aria-live="polite">
          <span className={`w-3.5 h-3.5 rounded-full ${currentTurn === "red" ? "bg-rose-500" : "bg-sky-500"}`} />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{gameOver ? "ผลการแข่งขัน" : "เทิร์นปัจจุบัน"}</div>
            <div className="text-sm font-bold text-white">{gameOver ? (winner ? `${teamName(winner)} ชนะ!` : "จบเกม") : teamName(currentTurn)}</div>
          </div>
        </div>
        {!gameOver ? (
          <button className="btn-secondary py-2.5 px-5 text-sm font-bold border-amber-400/30 text-amber-300 hover:bg-amber-400/10" onClick={endTurn} disabled={busy}>
            จบเทิร์น
          </button>
        ) : isSpy ? (
          <button className="btn-primary py-2.5 px-5 text-sm" onClick={restartRound} disabled={busy}>
            เริ่มรอบใหม่
          </button>
        ) : null}
      </div>

      {renderRulesModal()}
      {message && (
        <div className="toast-bar text-rose-300 border-rose-500/30">
          <span>{message}</span>
          <button className="text-white/70 hover:text-white" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
