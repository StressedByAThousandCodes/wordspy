"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Player, Room } from "@/types";

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

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const isHost = room?.host_id === myPlayerId;
  const readyCount = players.filter((p) => p.is_ready).length;
  const canStart = players.length >= 3 && readyCount >= players.length;

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    const playerId = sessionStorage.getItem("playerId");
    if (!playerId) {
      router.replace(`/join?code=${code}`);
      return;
    }
    setMyPlayerId(playerId);

    async function load() {
      const { data: roomData, error: roomErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (roomErr || !roomData) {
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

      if (playersData) setPlayers(playersData);
      setLoading(false);
    }

    load();
  }, [code, router]);

  // ── Realtime subscriptions ─────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`lobby:${room.id}`)
      // Player list changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          console.log("Realtime event received:", payload); // 👈 add this
          const { data } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", room.id)
            .order("joined_at");
          if (data) setPlayers(data);
        },
      )
      // Room status changes (game started)
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
          if (updated.status === "playing") {
            router.push(`/room/${code}/game`);
          }
        },
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, code, router]);

  // ── Actions ───────────────────────────────────────────────────
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
      if (!res.ok) throw new Error(data.error || "Failed to start game");
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
    // Optimistically update local state
    setRoom((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Loading lobby…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-1 pt-8">
        <h1 className="text-2xl font-bold">Waiting Room</h1>
        <p className="text-gray-400 text-sm">
          Share the code with your friends
        </p>
        <div className="inline-flex items-center gap-4 mt-3 px-6 py-3 rounded-2xl bg-gray-800 border border-gray-700">
          <span className="font-mono text-3xl font-bold tracking-widest text-indigo-400">
            {code}
          </span>
          <button
            onClick={copyLink}
            className="text-sm text-gray-400 hover:text-white transition"
          >
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-gray-400">
            Players — {players.length} / 16
          </p>
          <p className="text-sm text-gray-500">
            {readyCount} of {players.length} ready
          </p>
        </div>

        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-800 border border-gray-700"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
                {p.nickname[0].toUpperCase()}
              </div>
              <span className="font-medium">{p.nickname}</span>
              {room?.host_id === p.id && (
                <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                  Host
                </span>
              )}
              {p.id === myPlayerId && (
                <span className="text-xs text-gray-500">(you)</span>
              )}
            </div>
            <span
              className={`text-sm font-medium ${p.is_ready ? "text-green-400" : "text-gray-600"}`}
            >
              {p.is_ready ? "✓ Ready" : "Not ready"}
            </span>
          </div>
        ))}

        {players.length < 3 && (
          <p className="text-center text-gray-600 text-sm pt-1">
            Need at least {3 - players.length} more player
            {3 - players.length === 1 ? "" : "s"} to start
          </p>
        )}
      </div>

      {/* Settings — host only */}
      {isHost && room && (
        <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-4">
          <p className="text-sm font-medium text-gray-300">Game Settings</p>

          <SettingRow
            label="Spies"
            value={room.spy_count}
            min={1}
            max={Math.max(1, Math.floor(players.length / 3))}
            onChange={(v) => updateSetting("spy_count", v)}
          />
          <SettingRow
            label="Describe time (sec)"
            value={room.describe_seconds}
            min={15}
            max={120}
            step={15}
            onChange={(v) => updateSetting("describe_seconds", v)}
          />
          <SettingRow
            label="Discuss time (sec)"
            value={room.discuss_seconds}
            min={30}
            max={300}
            step={30}
            onChange={(v) => updateSetting("discuss_seconds", v)}
          />
          <SettingRow
            label="Vote time (sec)"
            value={room.vote_seconds}
            min={15}
            max={120}
            step={15}
            onChange={(v) => updateSetting("vote_seconds", v)}
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {/* Actions */}
      <div className="space-y-3 pb-8">
        <button
          onClick={toggleReady}
          className={`w-full py-3 rounded-xl font-semibold transition ${
            myPlayer?.is_ready
              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
              : "bg-green-600 hover:bg-green-500 text-white"
          }`}
        >
          {myPlayer?.is_ready ? "Cancel Ready" : "Ready Up"}
        </button>

        {isHost && (
          <button
            onClick={startGame}
            disabled={!canStart || starting}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition"
          >
            {starting
              ? "Starting…"
              : canStart
                ? "Start Game"
                : players.length < 3
                  ? `Need ${3 - players.length} more player${3 - players.length === 1 ? "" : "s"}`
                  : `Waiting for all players to ready up (${readyCount}/${players.length})`}
          </button>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function SettingRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-sm font-bold transition"
        >
          −
        </button>
        <span className="text-sm font-mono w-8 text-center">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-sm font-bold transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
