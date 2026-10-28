import { io, Socket } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (
  window.location.hostname === 'localhost' ? 'http://localhost:5000' : ''
);

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export function connectSocket() {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

