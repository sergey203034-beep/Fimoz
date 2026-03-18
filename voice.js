(() => {
  function makeId(prefix) {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  const pcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  class VoiceRoom {
    constructor({ roomKey, displayName, onPeers, onState }) {
      this.roomKey = roomKey;
      this.displayName = displayName;
      this.peerId = makeId("p");
      this.bc = new BroadcastChannel(`ds_voice_${roomKey}`);
      this.pcs = new Map(); // peerId -> RTCPeerConnection
      this.remoteStreams = new Map(); // peerId -> MediaStream
      this.remoteAudios = new Map(); // peerId -> HTMLAudioElement
      this.peerNames = new Map(); // peerId -> displayName
      this.peerStates = new Map(); // peerId -> { muted, deafened }
      this.localStream = null;
      this.muted = false;
      this.deafened = false;
      this.onPeers = onPeers || (() => {});
      this.onState = onState || (() => {});

      this.bc.onmessage = (ev) => this.onSignal(ev.data);
    }

    async join({ micDeviceId = "", outputVolume = 1 } = {}) {
      this.onState({ state: "joining" });
      const audioConstraint = micDeviceId ? { deviceId: { exact: micDeviceId } } : true;
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
      this.setOutputVolume(outputVolume);
      this.setMuted(false);
      this.setDeafened(false);

      this.bc.postMessage({ t: "hello", from: this.peerId, name: this.displayName });
      this.onState({ state: "connected" });
      this.emitPeers();
    }

    close() {
      for (const [pid, pc] of this.pcs) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {}
      }
      this.pcs.clear();
      for (const a of this.remoteAudios.values()) {
        try {
          a.srcObject = null;
          a.remove();
        } catch {}
      }
      this.remoteAudios.clear();
      this.remoteStreams.clear();
      if (this.localStream) {
        for (const t of this.localStream.getTracks()) t.stop();
      }
      this.localStream = null;
      try {
        this.bc.postMessage({ t: "bye", from: this.peerId });
        this.bc.close();
      } catch {}
      this.emitPeers();
      this.onState({ state: "closed" });
    }

    emitPeers() {
      const peers = Array.from(this.remoteStreams.keys()).map((pid) => ({
        peerId: pid,
        name: this.peerNames.get(pid) || pid,
        muted: (this.peerStates.get(pid) || {}).muted || false,
        deafened: (this.peerStates.get(pid) || {}).deafened || false,
      }));
      this.onPeers({ peers });
    }

    setMuted(on) {
      this.muted = !!on;
      if (this.localStream) {
        for (const tr of this.localStream.getAudioTracks()) tr.enabled = !this.muted;
      }
      try {
        this.bc.postMessage({ t: "state", from: this.peerId, muted: this.muted, deafened: this.deafened });
      } catch {}
      this.onState({ muted: this.muted, deafened: this.deafened });
    }

    setDeafened(on) {
      this.deafened = !!on;
      for (const a of this.remoteAudios.values()) a.muted = this.deafened;
      try {
        this.bc.postMessage({ t: "state", from: this.peerId, muted: this.muted, deafened: this.deafened });
      } catch {}
      this.onState({ muted: this.muted, deafened: this.deafened });
    }

    setOutputVolume(vol) {
      const v = Math.max(0, Math.min(1, Number(vol)));
      for (const a of this.remoteAudios.values()) a.volume = v;
      this.onState({ outputVolume: v });
    }

    async ensurePc(remotePeerId) {
      if (this.pcs.has(remotePeerId)) return this.pcs.get(remotePeerId);
      const pc = new RTCPeerConnection(pcConfig);
      this.pcs.set(remotePeerId, pc);

      if (this.localStream) {
        for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
      }

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        this.bc.postMessage({ t: "ice", from: this.peerId, to: remotePeerId, c: e.candidate });
      };

      pc.ontrack = (e) => {
        const stream = e.streams && e.streams[0] ? e.streams[0] : null;
        if (!stream) return;
        this.remoteStreams.set(remotePeerId, stream);
        if (!this.remoteAudios.has(remotePeerId)) {
          const a = document.createElement("audio");
          a.autoplay = true;
          a.playsInline = true;
          a.muted = this.deafened;
          a.volume = 1;
          a.srcObject = stream;
          a.dataset.peerId = remotePeerId;
          document.body.appendChild(a);
          this.remoteAudios.set(remotePeerId, a);
        }
        this.emitPeers();
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          this.cleanupPeer(remotePeerId);
        }
      };

      return pc;
    }

    cleanupPeer(remotePeerId) {
      const pc = this.pcs.get(remotePeerId);
      if (pc) {
        try {
          pc.close();
        } catch {}
      }
      this.pcs.delete(remotePeerId);
      this.remoteStreams.delete(remotePeerId);
      this.peerNames.delete(remotePeerId);
      this.peerStates.delete(remotePeerId);
      const a = this.remoteAudios.get(remotePeerId);
      if (a) {
        try {
          a.srcObject = null;
          a.remove();
        } catch {}
      }
      this.remoteAudios.delete(remotePeerId);
      this.emitPeers();
    }

    shouldInitiate(remotePeerId) {
      // детерминированно: "меньший" peerId инициирует offer
      return String(this.peerId) < String(remotePeerId);
    }

    async onSignal(msg) {
      if (!msg || typeof msg !== "object") return;
      if (msg.from === this.peerId) return;

      if (msg.t === "hello") {
        const remotePeerId = msg.from;
        if (msg.name) this.peerNames.set(remotePeerId, String(msg.name));
        // отвечаем присутствием, чтобы оба увидели друг друга
        this.bc.postMessage({ t: "helloAck", from: this.peerId, to: remotePeerId, name: this.displayName });
        if (this.shouldInitiate(remotePeerId)) await this.makeOffer(remotePeerId);
        return;
      }

      if (msg.t === "helloAck") {
        if (msg.to !== this.peerId) return;
        const remotePeerId = msg.from;
        if (msg.name) this.peerNames.set(remotePeerId, String(msg.name));
        if (this.shouldInitiate(remotePeerId)) await this.makeOffer(remotePeerId);
        return;
      }

      if (msg.t === "offer") {
        if (msg.to !== this.peerId) return;
        const remotePeerId = msg.from;
        const pc = await this.ensurePc(remotePeerId);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.bc.postMessage({ t: "answer", from: this.peerId, to: remotePeerId, sdp: pc.localDescription });
        return;
      }

      if (msg.t === "answer") {
        if (msg.to !== this.peerId) return;
        const remotePeerId = msg.from;
        const pc = await this.ensurePc(remotePeerId);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        return;
      }

      if (msg.t === "ice") {
        if (msg.to !== this.peerId) return;
        const remotePeerId = msg.from;
        const pc = await this.ensurePc(remotePeerId);
        try {
          await pc.addIceCandidate(msg.c);
        } catch {}
        return;
      }

      if (msg.t === "bye") {
        this.cleanupPeer(msg.from);
        return;
      }

      if (msg.t === "state") {
        const remotePeerId = msg.from;
        this.peerStates.set(remotePeerId, { muted: !!msg.muted, deafened: !!msg.deafened });
        this.emitPeers();
      }
    }

    async makeOffer(remotePeerId) {
      const pc = await this.ensurePc(remotePeerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      this.bc.postMessage({ t: "offer", from: this.peerId, to: remotePeerId, sdp: pc.localDescription });
    }
  }

  window.Voice = {
    createRoom({ roomKey, displayName, onPeers, onState }) {
      return new VoiceRoom({ roomKey, displayName, onPeers, onState });
    },
  };
})();

