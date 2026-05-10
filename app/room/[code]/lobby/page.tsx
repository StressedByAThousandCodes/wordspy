"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPlayerEmoji, getPlayerColor } from "@/lib/player";
import type { Player, Room, ChatMessage } from "@/types";

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [newPlayerIds, setNewPlayerIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const prevPlayerIds = useRef<Set<string>>(new Set());

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const isHost = room?.host_id === myPlayerId;
  const readyCount = players.filter((p) => p.is_ready).length;
  const canStart = players.length >= 3 && readyCount >= players.length;
  const readyPct =
    players.length > 0 ? Math.round((readyCount / players.length) * 100) : 0;

  useEffect(() => {
    const playerId = sessionStorage.getItem("playerId");
    if (!playerId) {
      router.replace(`/join?code=${code}`);
      return;
    }
    setMyPlayerId(playerId);
    async function load() {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .single();
      if (!roomData) {
        setError("Room not found");
        setLoading(false);
        return;
      }
      setRoom(roomData);
      const { data: playersData } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomData.id)
        .order("joined_at");

      if (playersData) {
        setPlayers(playersData);
        prevPlayerIds.current = new Set(playersData.map((p) => p.id));
      }
      // Load recent messages
      const { data: messagesData } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomData.id)
        .order("created_at")
        .limit(50);
      if (messagesData) setMessages(messagesData);

      setLoading(false);
    }
    load();
  }, [code, router]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`lobby:${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", room.id)
            .order("joined_at");
          if (data) {
            const incoming = new Set(data.map((p: Player) => p.id));
            const brand = new Set(
              [...incoming].filter((id) => !prevPlayerIds.current.has(id)),
            );
            if (brand.size > 0) {
              setNewPlayerIds(brand);
              setTimeout(() => setNewPlayerIds(new Set()), 800);
            }
            prevPlayerIds.current = incoming;
            setPlayers(data);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);
          if (updated.status === "playing") router.push(`/room/${code}/game`);
        },
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        payload => {
          setMessages(prev => [...prev, payload.new as ChatMessage])
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, code, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function toggleReady() {
    if (!myPlayer) return;
    await supabase
      .from("players")
      .update({ is_ready: !myPlayer.is_ready })
      .eq("id", myPlayer.id);
  }

  async function startGame() {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${code}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
    } catch (e: any) {
      setError(e.message);
      setStarting(false);
    }
  }

  async function updateSetting(key: string, value: number) {
    await fetch(`/api/rooms/${code}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setRoom((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function sendMessage() {
    if (!chatInput.trim() || !myPlayerId || !room) return
    setSendingChat(true)
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, playerId: myPlayerId, content: chatInput.trim() }),
    })
    setChatInput('')
    setSendingChat(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <LobbyLoading />;

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${code}`
      : "";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}&bgcolor=09090f&color=a78bfa&margin=16`;

  return (
    <main className="min-h-screen bg-[#0a0a0f] pb-32 px-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <div className="relative z-10 max-w-sm mx-auto pt-10 space-y-5">
        {/* Header */}
        <div className="text-center space-y-4">
          <div>
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mb-1">
              Room Code
            </p>
            <div className="inline-flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-3">
              <span
                className="font-black text-3xl tracking-[0.15em] text-violet-400"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {code}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={copyLink}
                  className="text-zinc-500 hover:text-white transition p-1.5 rounded-xl hover:bg-zinc-800 text-lg"
                >
                  {copied ? "✓" : "📋"}
                </button>
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="text-zinc-500 hover:text-white transition p-1.5 rounded-xl hover:bg-zinc-800 text-xs font-bold"
                >
                  QR
                </button>
              </div>
            </div>
          </div>

          {showQR && (
            <div className="inline-block bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="QR code to join room"
                width={160}
                height={160}
                className="rounded-xl mx-auto"
              />
              <p className="text-xs text-zinc-600 mt-2">Scan to join</p>
            </div>
          )}
        </div>

        {/* Ready bar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 font-medium">
              Players ready
            </span>
            <span className="text-xs font-bold text-violet-400">
              {readyCount} / {players.length}
            </span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${readyPct}%`,
                background: "linear-gradient(90deg, #7c3aed, #a855f7)",
              }}
            />
          </div>
          {players.length < 3 && (
            <p className="text-xs text-zinc-600 text-center">
              Need {3 - players.length} more player
              {3 - players.length !== 1 ? "s" : ""} to start
            </p>
          )}
        </div>

        {/* Player list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest px-1">
            Players — {players.length} / 16
          </p>
          {players.map((p) => {
            const emoji = getPlayerEmoji(p.id);
            const color = getPlayerColor(p.id);
            const isNew = newPlayerIds.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300
                  ${isNew ? "scale-[1.02] border-violet-500/50 bg-violet-500/5" : "border-zinc-800 bg-zinc-900/60"}
                `}
              >
                {/* Avatar */}
                <div
                  className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-2xl shrink-0 shadow-lg`}
                >
                  {emoji}
                  {p.is_ready && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#0a0a0f] flex items-center justify-center">
                      <span className="text-[8px]">✓</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm truncate">
                      {p.nickname}
                    </span>
                    {room?.host_id === p.id && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                        HOST
                      </span>
                    )}
                    {p.id === myPlayerId && (
                      <span className="text-[10px] text-zinc-500">(you)</span>
                    )}
                  </div>
                  <p
                    className={`text-xs mt-0.5 font-medium ${p.is_ready ? "text-green-400" : "text-zinc-600"}`}
                  >
                    {p.is_ready ? "✓ Ready to play" : "Not ready"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Settings — host only */}
        {isHost && room && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-zinc-400 hover:text-white transition"
            >
              <span className="flex items-center gap-2">
                ⚙️ <span>Game Settings</span>
              </span>
              <span className="text-zinc-700 text-xs">
                {showSettings ? "▲" : "▼"}
              </span>
            </button>
            {showSettings && (
              <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                {[
                  {
                    label: "Spies",
                    key: "spy_count",
                    value: room.spy_count,
                    min: 1,
                    max: Math.max(1, Math.floor(players.length / 3)),
                    step: 1,
                  },
                  {
                    label: "Describe (sec)",
                    key: "describe_seconds",
                    value: room.describe_seconds,
                    min: 15,
                    max: 120,
                    step: 15,
                  },
                  {
                    label: "Discuss (sec)",
                    key: "discuss_seconds",
                    value: room.discuss_seconds,
                    min: 30,
                    max: 300,
                    step: 30,
                  },
                  {
                    label: "Vote (sec)",
                    key: "vote_seconds",
                    value: room.vote_seconds,
                    min: 15,
                    max: 120,
                    step: 15,
                  },
                ].map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-zinc-400">{s.label}</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          updateSetting(
                            s.key,
                            Math.max(s.min, s.value - s.step),
                          )
                        }
                        disabled={s.value <= s.min}
                        className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white font-bold transition text-sm"
                      >
                        −
                      </button>
                      <span className="text-sm font-bold text-white w-8 text-center tabular-nums">
                        {s.value}
                      </span>
                      <button
                        onClick={() =>
                          updateSetting(
                            s.key,
                            Math.min(s.max, s.value + s.step),
                          )
                        }
                        disabled={s.value >= s.max}
                        className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white font-bold transition text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        {room && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">💬 Lobby Chat</p>
            </div>

            {/* Messages */}
            <div className="h-48 overflow-y-auto px-3 py-3 space-y-2 scrollbar-none">
              {messages.length === 0 && (
                <p className="text-center text-zinc-700 text-xs py-4">No messages yet — say hi! 👋</p>
              )}
              {messages.map(msg => {
                const sender = players.find(p => p.id === msg.player_id)
                const isMe = msg.player_id === myPlayerId
                const emoji = sender ? getPlayerEmoji(sender.id) : '❓'
                const color = sender ? getPlayerColor(sender.id) : { bg: 'from-zinc-500 to-zinc-600' }
                return (
                  <div key={msg.id} className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-sm shrink-0 mt-0.5`}>
                      {emoji}
                    </div>
                    <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      {!isMe && (
                        <span className="text-[10px] text-zinc-600 font-medium px-1">
                          {sender?.nickname ?? 'Unknown'}
                        </span>
                      )}
                      <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed
                        ${isMe
                          ? 'bg-violet-600 text-white rounded-tr-sm'
                          : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'
                        }`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-zinc-800 px-3 py-2 flex gap-2">
              <input
                type="text"
                placeholder="Say something…"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                maxLength={200}
                className="flex-1 bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || sendingChat}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition shrink-0"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                {sendingChat ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : '↑'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Fixed bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent">
        <div className="max-w-sm mx-auto space-y-3">
          <button
            onClick={toggleReady}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-200
              ${
                myPlayer?.is_ready
                  ? "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                  : "text-white border-0"
              }`}
            style={
              myPlayer?.is_ready
                ? {}
                : { background: "linear-gradient(135deg, #059669, #10b981)" }
            }
          >
            {myPlayer?.is_ready ? "✕ Cancel Ready" : "✓ Ready Up"}
          </button>

          {isHost && (
            <button
              onClick={startGame}
              disabled={!canStart || starting}
              className="w-full py-4 rounded-2xl font-bold text-base text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
              style={{
                background: canStart
                  ? "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)"
                  : "#27272a",
              }}
            >
              {starting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting…
                </span>
              ) : canStart ? (
                "🚀 Start Game!"
              ) : players.length < 3 ? (
                `Need ${3 - players.length} more player${3 - players.length !== 1 ? "s" : ""}`
              ) : (
                `Waiting for all to ready up (${readyCount}/${players.length})`
              )}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function LobbyLoading() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="space-y-2 text-center">
        <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto" />
        <p className="text-zinc-600 text-sm">Loading lobby…</p>
      </div>
    </main>
  );
}
