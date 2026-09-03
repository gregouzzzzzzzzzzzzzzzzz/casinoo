import { io, Socket } from 'socket.io-client';

// Detect backend URL dynamically from environment or current window hostname for local network deployment
const getBackendUrl = (): string => {
  if (typeof window === 'undefined') return 'http://localhost:3001';
  // Page served by the backend itself (single-process mode, port 3001):
  // always talk to the same origin, never to a remote VITE_SERVER_URL.
  if (window.location.port === '3001') {
    return window.location.origin;
  }
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:3001`;
};

export const socket: Socket = io(getBackendUrl(), {
  autoConnect: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});
