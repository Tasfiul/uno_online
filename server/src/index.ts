import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { authRouter } from './routes/auth';
import { RoomManager } from './game/roomManager';
import { setupSocketHandler } from './socket/socketHandler';

dotenv.config();

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL;

// CORS configuration for local development, Vercel, and Render deployments
app.use(cors({
  origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173', 'http://localhost:5000'] : '*',
  credentials: true,
}));

// Generous limit to support custom avatar base64 uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const roomManager = new RoomManager();

// Routes
app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    mongoConnected: mongoose.connection.readyState === 1,
  });
});

app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getPublicRooms());
});

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL ? [CLIENT_URL, 'http://localhost:5173', 'http://localhost:5000'] : '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

setupSocketHandler(io, roomManager);

// Connect to MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(async () => {
      console.log('✅ Connected to MongoDB Atlas successfully.');
      // Cleanup any legacy indexes from other projects in the same cluster
      try {
        await mongoose.connection.collection('users').dropIndex('email_1');
      } catch {}
      try {
        await mongoose.connection.collection('uno_users').dropIndex('email_1');
      } catch {}
    })
    .catch((err) => {
      console.warn('⚠️ MongoDB Atlas connection failed:', err.message);
      console.warn('⚡ Using robust in-memory store fallback. The server remains fully operational.');
    });
} else {
  console.log('ℹ️ No MONGODB_URI provided in environment. Running with in-memory store fallback.');
  console.log('ℹ️ When deploying to Render, provide MONGODB_URI in Render Environment Variables.');
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Uno Online Backend Server listening on port ${PORT}`);
  console.log(`🌐 Ready for connections from local frontend and Vercel deployments`);
});

