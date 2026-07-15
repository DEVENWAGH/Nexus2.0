"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mic, MicOff, PhoneOff, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSocket } from "@/components/providers/socket-provider";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import UserAvatar from "@/components/user-avatar";

// ── Types ─────────────────────────────────────────────────────────────────

interface P2PPeer {
  peerId: string;
  userId?: string;
  stream: MediaStream | null;
  audioEnabled: boolean;
  name?: string;
  imageUrl?: string;
}

interface P2PVoiceRoomProps {
  chatId: string;
  channelName?: string;
  myUserId: string;
  myName: string;
  myImageUrl?: string;
  /** Kept for MediaRoom API compatibility */
  enableVideo?: boolean;
  onLeave?: () => void;
}

// ── ICE configuration ──────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const MAX_MESH_PEERS = 8;
const SPEAKING_GREEN = "#23a559";

function PeerCard({
  peer,
  audioRefCallback,
}: {
  peer: P2PPeer;
  audioRefCallback: (peerId: string, el: HTMLAudioElement | null) => void;
}) {
  const isSpeaking = useVoiceActivity(peer.stream, peer.audioEnabled);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "relative flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-900 border transition-all duration-200",
        !peer.audioEnabled && "opacity-70",
        isSpeaking
          ? "border-transparent"
          : "border-zinc-800/80 hover:border-zinc-700/80",
      )}
      style={
        isSpeaking
          ? {
              boxShadow: `0 0 0 3px ${SPEAKING_GREEN}, 0 0 16px ${SPEAKING_GREEN}55`,
            }
          : undefined
      }
    >
      <audio
        ref={(el) => audioRefCallback(peer.peerId, el)}
        autoPlay
        className="sr-only"
      />

      <div className="relative">
        <div
          className="rounded-full transition-all duration-150"
          style={
            isSpeaking
              ? { boxShadow: `0 0 0 3px ${SPEAKING_GREEN}` }
              : undefined
          }
        >
          <UserAvatar
            src={peer.imageUrl}
            name={peer.name ?? peer.userId ?? "Peer"}
            className="h-20 w-20 text-2xl"
          />
        </div>
        {!peer.audioEnabled && (
          <div className="absolute bottom-0 right-0 bg-red-600 rounded-full p-2 border-2 border-zinc-900 shadow-md">
            <MicOff className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>
      <span className="text-sm font-medium mt-3.5 text-zinc-200 truncate max-w-full px-2">
        {peer.name ?? peer.userId ?? "Peer"}
      </span>
      <span
        className={cn(
          "text-[10px] font-mono mt-0.5",
          isSpeaking ? "text-emerald-400" : "text-zinc-500",
        )}
      >
        {isSpeaking ? "Speaking" : peer.stream ? "Connected" : "Connecting..."}
      </span>
    </motion.div>
  );
}

function SelfCard({
  stream,
  myName,
  myImageUrl,
  myAudioEnabled,
}: {
  stream: MediaStream | null;
  myName: string;
  myImageUrl?: string;
  myAudioEnabled: boolean;
}) {
  const isSpeaking = useVoiceActivity(stream, myAudioEnabled);

  return (
    <motion.div
      layout
      className={cn(
        "relative flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-900 border transition-all duration-200",
        !myAudioEnabled && "opacity-70",
        isSpeaking
          ? "border-transparent"
          : "border-zinc-800/80 hover:border-zinc-700/80",
      )}
      style={
        isSpeaking
          ? {
              boxShadow: `0 0 0 3px ${SPEAKING_GREEN}, 0 0 16px ${SPEAKING_GREEN}55`,
            }
          : undefined
      }
    >
      <div className="relative">
        <div
          className="rounded-full transition-all duration-150"
          style={
            isSpeaking
              ? { boxShadow: `0 0 0 3px ${SPEAKING_GREEN}` }
              : undefined
          }
        >
          <UserAvatar
            src={myImageUrl}
            name={myName}
            className="h-20 w-20 text-2xl"
          />
        </div>
        {!myAudioEnabled && (
          <div className="absolute bottom-0 right-0 bg-red-600 rounded-full p-2 border-2 border-zinc-900 shadow-md">
            <MicOff className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>
      <span className="text-sm font-medium mt-3.5 text-zinc-200">You</span>
      <span
        className={cn(
          "text-[10px] font-mono mt-0.5",
          isSpeaking ? "text-emerald-400" : "text-zinc-500",
        )}
      >
        {isSpeaking ? "Speaking" : myAudioEnabled ? "Connected" : "Muted"}
      </span>
    </motion.div>
  );
}

export function P2PVoiceRoom({
  chatId,
  channelName = "voice",
  myUserId,
  myName,
  myImageUrl,
  onLeave,
}: P2PVoiceRoomProps) {
  const { socket } = useSocket();

  const [peers, setPeers] = useState<Map<string, P2PPeer>>(new Map());
  const [myAudioEnabled, setMyAudioEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [peerCount, setPeerCount] = useState(0);

  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");

  const myPeerId = useRef<string>(crypto.randomUUID());
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const myAudioEnabledRef = useRef(true);

  const attachRemoteAudio = useCallback((peerId: string, stream: MediaStream) => {
    const el = peerAudioRefs.current.get(peerId);
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {
      /* autoplay may be blocked until gesture; mic grant usually unlocks it */
    });
  }, []);

  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const setAudioRef = useCallback((peerId: string, el: HTMLAudioElement | null) => {
    if (el) {
      peerAudioRefs.current.set(peerId, el);
      const stream = peerStreamsRef.current.get(peerId);
      if (stream) {
        el.srcObject = stream;
        void el.play().catch(() => undefined);
      }
    } else {
      peerAudioRefs.current.delete(peerId);
    }
  }, []);

  const flushIce = useCallback(async (remotePeerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIce.current.get(remotePeerId);
    if (!queued?.length) return;
    pendingIce.current.delete(remotePeerId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("[P2PVoice] Failed to flush ICE candidate:", e);
      }
    }
  }, []);

  const startLocalMedia = useCallback(async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioMics = devices.filter((device) => device.kind === "audioinput");
      setMics(audioMics);

      const activeTrack = stream.getAudioTracks()[0];
      if (activeTrack) {
        const settings = activeTrack.getSettings();
        setSelectedMicId(settings.deviceId || "default");
      }

      return stream;
    } catch (err) {
      console.error("[P2PVoice] Failed to get local media:", err);
      return null;
    }
  }, []);

  const changeMicrophone = async (deviceId: string) => {
    try {
      setSelectedMicId(deviceId);
      const stream = await startLocalMedia(deviceId);
      if (!stream) return;

      const newTrack = stream.getAudioTracks()[0];
      if (!newTrack) return;

      for (const pc of peerConnections.current.values()) {
        const senders = pc.getSenders();
        const audioSender = senders.find((s) => s.track?.kind === "audio");
        if (audioSender) {
          await audioSender.replaceTrack(newTrack);
        }
      }
    } catch (err) {
      console.error("[P2PVoice] Failed to change microphone track:", err);
    }
  };

  const broadcastMediaState = useCallback((toPeerId?: string) => {
    if (!socket) return;
    const payload = {
      type: "media-state",
      audio: myAudioEnabledRef.current,
      name: myName,
      imageUrl: myImageUrl,
      userId: myUserId,
    };

    const targets = toPeerId ? [toPeerId] : Array.from(peerConnections.current.keys());
    // Also include peers we know about even if PC not ready
    const peerIds = new Set([...targets, ...peers.keys()]);
    if (toPeerId) peerIds.add(toPeerId);

    for (const peerId of peerIds) {
      if (peerId === myPeerId.current) continue;
      socket.emit("p2p:signal", {
        roomId: chatId,
        toPeerId: peerId,
        fromPeerId: myPeerId.current,
        payload,
      });
    }
  }, [socket, chatId, myName, myImageUrl, myUserId, peers]);

  const createPeerConnection = useCallback((remotePeerId: string): RTCPeerConnection => {
    const existing = peerConnections.current.get(remotePeerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      peerStreamsRef.current.set(remotePeerId, remoteStream);
      setPeers((prev) => {
        const next = new Map(prev);
        const existingPeer = next.get(remotePeerId);
        next.set(remotePeerId, {
          ...(existingPeer ?? { peerId: remotePeerId, audioEnabled: true }),
          stream: remoteStream,
        });
        return next;
      });
      attachRemoteAudio(remotePeerId, remoteStream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("p2p:signal", {
          roomId: chatId,
          toPeerId: remotePeerId,
          fromPeerId: myPeerId.current,
          payload: { type: "ice", candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[P2PVoice] Peer ${remotePeerId} state: ${pc.connectionState}`);
      if (pc.connectionState === "failed") {
        pc.restartIce();
      }
    };

    peerConnections.current.set(remotePeerId, pc);
    return pc;
  }, [chatId, socket, attachRemoteAudio]);

  const sendOffer = useCallback(async (remotePeerId: string) => {
    try {
      const pc = createPeerConnection(remotePeerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      if (socket) {
        socket.emit("p2p:signal", {
          roomId: chatId,
          toPeerId: remotePeerId,
          fromPeerId: myPeerId.current,
          payload: { type: "offer", sdp: pc.localDescription },
        });
      }
    } catch (err) {
      console.error("[P2PVoice] Failed to create or send offer:", err);
    }
  }, [chatId, createPeerConnection, socket]);

  const handleSignal = useCallback(async (fromPeerId: string, signal: Record<string, any>) => {
    try {
      let pc = peerConnections.current.get(fromPeerId);

      if (signal.type === "offer") {
        if (pc && pc.signalingState !== "stable") {
          if (myPeerId.current < fromPeerId) {
            console.log("[P2PVoice] Glare: ignoring offer because we have priority");
            return;
          }
          try {
            await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
          } catch {
            pc.close();
            peerConnections.current.delete(fromPeerId);
            pc = undefined;
          }
        }
        if (!pc) pc = createPeerConnection(fromPeerId);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushIce(fromPeerId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (socket) {
            socket.emit("p2p:signal", {
              roomId: chatId,
              toPeerId: fromPeerId,
              fromPeerId: myPeerId.current,
              payload: { type: "answer", sdp: pc.localDescription },
            });
          }
        } catch (e) {
          console.warn("[P2PVoice] Failed to process incoming offer:", e);
        }
      } else if (signal.type === "answer") {
        if (pc && pc.signalingState === "have-local-offer") {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await flushIce(fromPeerId, pc);
          } catch (e) {
            console.warn("[P2PVoice] Failed to set remote answer:", e);
          }
        } else {
          console.log(`[P2PVoice] Ignoring answer. Signaling state: ${pc?.signalingState}`);
        }
      } else if (signal.type === "ice" && signal.candidate) {
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn("[P2PVoice] Failed to add ICE candidate:", e);
          }
        } else {
          const queue = pendingIce.current.get(fromPeerId) ?? [];
          queue.push(signal.candidate);
          pendingIce.current.set(fromPeerId, queue);
        }
      } else if (signal.type === "media-state") {
        setPeers((prev) => {
          const next = new Map(prev);
          const existingPeer = next.get(fromPeerId);
          next.set(fromPeerId, {
            ...(existingPeer ?? { peerId: fromPeerId, stream: null, audioEnabled: true }),
            audioEnabled: !!signal.audio,
            name: signal.name ?? existingPeer?.name,
            imageUrl: signal.imageUrl ?? existingPeer?.imageUrl,
            userId: signal.userId ?? existingPeer?.userId,
          });
          return next;
        });
      }
    } catch (err) {
      console.error("[P2PVoice] Signal processing failed:", err);
    }
  }, [chatId, createPeerConnection, socket, flushIce]);

  useEffect(() => {
    if (!socket) {
      setConnectionStatus("connecting");
      return;
    }

    let disposed = false;

    const connect = async () => {
      const stream = await startLocalMedia();
      if (!stream || disposed) {
        if (!disposed) setConnectionStatus("error");
        return;
      }

      socket.emit("p2p:join", {
        roomId: chatId,
        peerId: myPeerId.current,
        userId: myUserId,
      });
      if (!disposed) setConnectionStatus("connected");

      const onJoined = async (data: {
        roomId: string;
        peerId: string;
        peers: { peerId: string; userId?: string }[];
      }) => {
        const existingPeers = data.peers || [];
        for (const peer of existingPeers) {
          if (peer.peerId === myPeerId.current) continue;
          setPeers((prev) => {
            const next = new Map(prev);
            if (!next.has(peer.peerId)) {
              next.set(peer.peerId, {
                peerId: peer.peerId,
                userId: peer.userId,
                stream: null,
                audioEnabled: true,
              });
            }
            return next;
          });
          await sendOffer(peer.peerId);
          broadcastMediaState(peer.peerId);
        }
        setPeerCount(existingPeers.length);
      };

      const onPeerJoined = (data: { peerId: string; userId?: string }) => {
        const newPeerId = data.peerId;
        if (newPeerId === myPeerId.current) return;

        setPeers((prev) => {
          const next = new Map(prev);
          next.set(newPeerId, {
            peerId: newPeerId,
            userId: data.userId,
            stream: null,
            audioEnabled: true,
          });
          return next;
        });
        setPeerCount((c) => c + 1);
        broadcastMediaState(newPeerId);
      };

      const onPeerLeft = (data: { peerId: string }) => {
        const leftPeerId = data.peerId;
        const pc = peerConnections.current.get(leftPeerId);
        pc?.close();
        peerConnections.current.delete(leftPeerId);
        pendingIce.current.delete(leftPeerId);
        peerAudioRefs.current.delete(leftPeerId);
        peerStreamsRef.current.delete(leftPeerId);
        setPeers((prev) => {
          const next = new Map(prev);
          next.delete(leftPeerId);
          return next;
        });
        setPeerCount((c) => Math.max(0, c - 1));
      };

      const onSignal = async (data: { fromPeerId: string; payload: any }) => {
        await handleSignal(data.fromPeerId, data.payload);
      };

      socket.on("p2p:joined", onJoined);
      socket.on("p2p:peer-joined", onPeerJoined);
      socket.on("p2p:peer-left", onPeerLeft);
      socket.on("p2p:signal", onSignal);
    };

    void connect();

    return () => {
      disposed = true;
      socket.emit("p2p:leave", { roomId: chatId, peerId: myPeerId.current });
      socket.off("p2p:joined");
      socket.off("p2p:peer-joined");
      socket.off("p2p:peer-left");
      socket.off("p2p:signal");

      for (const pc of peerConnections.current.values()) pc.close();
      peerConnections.current.clear();
      pendingIce.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, myUserId, socket]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        myAudioEnabledRef.current = audioTrack.enabled;
        setMyAudioEnabled(audioTrack.enabled);
        broadcastMediaState();
      }
    }
  };

  const handleLeave = () => {
    onLeave?.();
  };

  const peerList = Array.from(peers.values()).slice(0, MAX_MESH_PEERS);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col flex-1 h-full bg-zinc-950 text-white select-none"
    >
      <div className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800">
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-wide text-zinc-100">
            #{channelName}
          </span>
          <span className="text-xs text-zinc-400 mt-0.5">
            Voice Room · {peerCount + 1} connected
          </span>
        </div>

        <div className="flex items-center gap-3">
          {connectionStatus === "connecting" && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Connecting...
            </div>
          )}
          {connectionStatus === "connected" && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
              <Wifi className="h-3.5 w-3.5" />
              Connected
            </div>
          )}
          {connectionStatus === "error" && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <WifiOff className="h-3.5 w-3.5" />
              Connection Error
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
        <div className="max-w-4xl w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 justify-center">
          <SelfCard
            stream={localStream}
            myName={myName}
            myImageUrl={myImageUrl}
            myAudioEnabled={myAudioEnabled}
          />

          <AnimatePresence>
            {peerList.map((peer) => (
              <PeerCard
                key={peer.peerId}
                peer={peer}
                audioRefCallback={setAudioRef}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 px-4 py-5 bg-zinc-900 border-t border-zinc-800/80">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAudio}
          className={cn(
            "h-12 w-12 rounded-full transition-all duration-200 cursor-pointer shadow-md",
            myAudioEnabled
              ? "bg-zinc-800 hover:bg-zinc-700 text-white"
              : "bg-red-600 hover:bg-red-500 text-white",
          )}
        >
          {myAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        {mics.length > 0 && (
          <div className="flex items-center">
            <select
              value={selectedMicId}
              onChange={(e) => changeMicrophone(e.target.value)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[200px] truncate transition-colors shadow-md"
            >
              {mics.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLeave}
          className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all duration-200 cursor-pointer shadow-md"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
}
