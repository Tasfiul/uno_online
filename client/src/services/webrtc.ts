import { socket } from './socket';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export class VoiceChatService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
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
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.isEnabled = true;
      this.isMuted = false;
      this.setupVAD();
      this.setupSocketListeners();
      return true;
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      this.isEnabled = false;
      return false;
    }
  }

  public disableVoice() {
    this.isEnabled = false;
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    for (const audio of this.audioElements.values()) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
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

  public connectToPeer(remoteSocketId: string) {
    if (!this.isEnabled || !this.localStream || this.peerConnections.has(remoteSocketId)) {
      return;
    }

    const pc = this.createPeerConnection(remoteSocketId);
    this.peerConnections.set(remoteSocketId, pc);

    // Add local tracks
    this.localStream.getTracks().forEach(track => {
      pc.addTrack(track, this.localStream!);
    });

    // Create offer
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit('voice:signal', {
          target: remoteSocketId,
          signal: pc.localDescription,
        });
      })
      .catch(err => console.error('Error creating offer:', err));
  }

  private createPeerConnection(remoteSocketId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('voice:signal', {
          target: remoteSocketId,
          signal: { type: 'candidate', candidate: event.candidate },
        });
      }
    };

    pc.ontrack = event => {
      let audio = this.audioElements.get(remoteSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        document.body.appendChild(audio);
        this.audioElements.set(remoteSocketId, audio);
      }
      audio.srcObject = event.streams[0];
    };

    return pc;
  }

  private setupSocketListeners() {
    socket.off('voice:signal');
    socket.off('voice:peer_left');

    socket.on('voice:signal', async (data: { sender: string; signal: any }) => {
      if (!this.isEnabled || !this.localStream) return;

      let pc = this.peerConnections.get(data.sender);
      if (!pc) {
        pc = this.createPeerConnection(data.sender);
        this.peerConnections.set(data.sender, pc);

        if (this.localStream) {
          this.localStream.getTracks().forEach(track => {
            pc?.addTrack(track, this.localStream!);
          });
        }
      }

      if (!pc) return;

      try {
        if (data.signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', {
            target: data.sender,
            signal: pc.localDescription,
          });
        } else if (data.signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        } else if (data.signal.type === 'candidate' && data.signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
      }
    });

    socket.on('voice:peer_left', (data: { playerId: string }) => {
      const pc = this.peerConnections.get(data.playerId);
      if (pc) {
        pc.close();
        this.peerConnections.delete(data.playerId);
      }
      const audio = this.audioElements.get(data.playerId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
        this.audioElements.delete(data.playerId);
      }
    });
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
      console.warn('Voice Activity Detection error:', e);
    }
  }
}

export const voiceChat = new VoiceChatService();
