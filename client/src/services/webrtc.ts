import { socket } from './socket';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private candidateQueue: Map<string, any[]> = new Map();
  private isMuted: boolean = false;
  private isEnabled: boolean = false;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private vadInterval: any = null;
  private onSpeakingChange?: (isSpeaking: boolean) => void;
  private onRemoteSpeakingChange?: (peerId: string, isSpeaking: boolean) => void;

  public setCallbacks(
    onSpeakingChange?: (isSpeaking: boolean) => void,
    onRemoteSpeakingChange?: (peerId: string, isSpeaking: boolean) => void
  ) {
    this.onSpeakingChange = onSpeakingChange;
    this.onRemoteSpeakingChange = onRemoteSpeakingChange;
  }

  public async enableVoice(): Promise<boolean> {
    if (this.isEnabled) return true;

    try {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (micErr) {
        console.warn('[WebRTC] Microphone permission denied or device not found, proceeding in receive-only mode:', micErr);
        this.localStream = null;
      }

      this.isEnabled = true;
      this.isMuted = false;
      this.setupVAD();
      this.setupSocketListeners();

      // Announce voice join to room
      socket.emit('voice:join');
      return true;
    } catch (err) {
      console.error('[WebRTC] Failed to enable voice:', err);
      this.isEnabled = false;
      return false;
    }
  }

  public disableVoice() {
    if (!this.isEnabled) return;
    this.isEnabled = false;

    socket.emit('voice:leave');

    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    for (const pc of this.peerConnections.values()) {
      try {
        pc.close();
      } catch (e) {}
    }
    this.peerConnections.clear();
    this.candidateQueue.clear();

    for (const audio of this.audioElements.values()) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch (e) {}
    }
    this.audioElements.clear();

    socket.emit('voice:mute_change', { isMuted: true });
    socket.emit('voice:speaking_change', { isSpeaking: false });
  }

  public toggleMute(): boolean {
    if (!this.localStream) return true;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    socket.emit('voice:mute_change', { isMuted: this.isMuted });
    if (this.isMuted && this.onSpeakingChange) {
      this.onSpeakingChange(false);
      socket.emit('voice:speaking_change', { isSpeaking: false });
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public async connectToPeer(remoteSocketId: string) {
    if (!this.isEnabled || this.peerConnections.has(remoteSocketId)) {
      return;
    }

    console.log(`[WebRTC] Initiating voice connection to peer: ${remoteSocketId}`);
    const pc = this.createPeerConnection(remoteSocketId);

    // Add local audio tracks or receive-only transceiver
    if (this.localStream && this.localStream.getAudioTracks().length > 0) {
      this.localStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      // Serialize as plain JSON object to guarantee proper socket transmission
      socket.emit('voice:signal', {
        target: remoteSocketId,
        signal: {
          type: offer.type,
          sdp: offer.sdp,
        },
      });
      console.log(`[WebRTC] Sent offer to ${remoteSocketId}`);
    } catch (err) {
      console.error(`[WebRTC] Error creating offer for peer ${remoteSocketId}:`, err);
    }
  }

  private createPeerConnection(remoteSocketId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(remoteSocketId);
    if (existing) {
      try {
        existing.close();
      } catch (e) {}
      this.peerConnections.delete(remoteSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peerConnections.set(remoteSocketId, pc);

    pc.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('voice:signal', {
          target: remoteSocketId,
          signal: {
            type: 'candidate',
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            },
          },
        });
      }
    };

    pc.ontrack = event => {
      console.log(`[WebRTC] Remote track received from ${remoteSocketId}:`, event.track.kind);
      let audio = this.audioElements.get(remoteSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        // Keep in DOM offscreen so browser does not suspend playback
        audio.style.position = 'fixed';
        audio.style.top = '-9999px';
        audio.style.left = '-9999px';
        audio.style.width = '1px';
        audio.style.height = '1px';
        audio.style.opacity = '0.01';
        audio.style.pointerEvents = 'none';
        document.body.appendChild(audio);
        this.audioElements.set(remoteSocketId, audio);
      }

      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      audio.srcObject = stream;
      audio.volume = 1.0;
      audio.muted = false;

      const tryPlay = () => {
        audio?.play().catch(err => {
          console.warn(`[WebRTC] Playback waiting for interaction from ${remoteSocketId}:`, err.message);
        });
      };

      tryPlay();

      event.track.onunmute = () => {
        console.log(`[WebRTC] Remote track unmuted from ${remoteSocketId}`);
        tryPlay();
      };

      // Unlock on any subsequent user interaction
      const resumeAudio = () => {
        tryPlay();
      };
      window.addEventListener('click', resumeAudio, { passive: true });
      window.addEventListener('touchstart', resumeAudio, { passive: true });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remoteSocketId} connectionState:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handlePeerLeft(remoteSocketId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${remoteSocketId} iceConnectionState:`, pc.iceConnectionState);
    };

    return pc;
  }

  private setupSocketListeners() {
    socket.off('voice:peers');
    socket.off('voice:peer_joined');
    socket.off('voice:peer_left');
    socket.off('voice:signal');
    socket.off('voice:speaking_status');

    // 1. Existing voice peers when joining
    socket.on('voice:peers', async (data: { peers: string[] }) => {
      if (!this.isEnabled) return;
      console.log('[WebRTC] Received existing voice peers:', data.peers);
      for (const peerId of data.peers || []) {
        if (peerId && peerId !== socket.id) {
          await this.connectToPeer(peerId);
        }
      }
    });

    // 2. New peer joined voice
    socket.on('voice:peer_joined', (data: { peerId: string; playerId: string }) => {
      const peerId = data.peerId || data.playerId;
      if (!this.isEnabled || !peerId || peerId === socket.id) return;
      console.log('[WebRTC] New voice peer joined:', peerId);
      setTimeout(() => {
        if (this.isEnabled && !this.peerConnections.has(peerId)) {
          this.connectToPeer(peerId);
        }
      }, 1500);
    });

    // 3. WebRTC signaling (Offer / Answer / Candidate)
    socket.on('voice:signal', async (data: { sender: string; signal: any }) => {
      if (!this.isEnabled) return;
      const peerId = data.sender;
      if (!peerId || !data.signal) return;

      console.log(`[WebRTC] Received signal from ${peerId}:`, data.signal.type);
      let pc = this.peerConnections.get(peerId);

      try {
        if (data.signal.type === 'offer') {
          if (pc && pc.signalingState !== 'stable') {
            const isPolite = (socket.id || '') < peerId;
            if (!isPolite) {
              console.log(`[WebRTC] Glare detected, impolite peer ignoring offer from ${peerId}`);
              return;
            }
            console.log(`[WebRTC] Glare detected, polite peer rolling back for ${peerId}`);
            try {
              await pc.setLocalDescription({ type: 'rollback' });
            } catch (e) {
              pc.close();
              pc = undefined;
            }
          }

          if (!pc) {
            pc = this.createPeerConnection(peerId);
            if (this.localStream && this.localStream.getAudioTracks().length > 0) {
              this.localStream.getAudioTracks().forEach(track => {
                pc!.addTrack(track, this.localStream!);
              });
            } else {
              pc.addTransceiver('audio', { direction: 'recvonly' });
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription({
            type: data.signal.type,
            sdp: data.signal.sdp,
          }));
          await this.drainCandidateQueue(peerId, pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('voice:signal', {
            target: peerId,
            signal: {
              type: answer.type,
              sdp: answer.sdp,
            },
          });
          console.log(`[WebRTC] Sent answer to ${peerId}`);
        } else if (data.signal.type === 'answer') {
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription({
            type: data.signal.type,
            sdp: data.signal.sdp,
          }));
          await this.drainCandidateQueue(peerId, pc);
          console.log(`[WebRTC] Remote answer applied for ${peerId}`);
        } else if (data.signal.type === 'candidate' && data.signal.candidate) {
          const cand = data.signal.candidate;
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(err => {
              console.warn('[WebRTC] addIceCandidate error:', err);
            });
          } else {
            if (!this.candidateQueue.has(peerId)) {
              this.candidateQueue.set(peerId, []);
            }
            this.candidateQueue.get(peerId)!.push(cand);
          }
        }
      } catch (err) {
        console.error('[WebRTC] Error handling signal:', err);
      }
    });

    // 4. Remote peer left voice
    socket.on('voice:peer_left', (data: { peerId?: string; playerId?: string }) => {
      const peerId = data.peerId || data.playerId;
      if (peerId) {
        this.handlePeerLeft(peerId);
      }
    });

    // 5. Remote peer speaking indicator
    socket.on('voice:speaking_status', (data: { peerId?: string; playerId?: string; isSpeaking: boolean }) => {
      const peerId = data.peerId || data.playerId;
      if (peerId && this.onRemoteSpeakingChange) {
        this.onRemoteSpeakingChange(peerId, data.isSpeaking);
      }
    });
  }

  private async drainCandidateQueue(peerId: string, pc: RTCPeerConnection) {
    const queue = this.candidateQueue.get(peerId);
    if (!queue || queue.length === 0) return;
    this.candidateQueue.delete(peerId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Error draining queued ICE candidate:', e);
      }
    }
  }

  private handlePeerLeft(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      this.peerConnections.delete(peerId);
    }
    this.candidateQueue.delete(peerId);

    const audio = this.audioElements.get(peerId);
    if (audio) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch (e) {}
      this.audioElements.delete(peerId);
    }

    if (this.onRemoteSpeakingChange) {
      this.onRemoteSpeakingChange(peerId, false);
    }
  }

  private setupVAD() {
    if (!this.localStream) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let wasSpeaking = false;

      this.vadInterval = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (wasSpeaking) {
            wasSpeaking = false;
            if (this.onSpeakingChange) this.onSpeakingChange(false);
            socket.emit('voice:speaking_change', { isSpeaking: false });
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const isSpeaking = average > 18; // Voice detection threshold

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          if (this.onSpeakingChange) this.onSpeakingChange(isSpeaking);
          socket.emit('voice:speaking_change', { isSpeaking });
        }
      }, 150);
    } catch (e) {
      console.warn('[WebRTC] Voice Activity Detection error:', e);
    }
  }
}

export const voiceChat = new VoiceChatService();
