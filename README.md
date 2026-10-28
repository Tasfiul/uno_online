# 🎴 UNO 3D Online — Multiplayer with Live Voice Chat

A full-featured, real-time multiplayer 3D UNO game built with **Three.js**, **React 19**, **Vite**, **TypeScript**, **Node.js/Express**, **Socket.IO**, **WebRTC**, and **MongoDB Atlas**. Designed to run smoothly on both desktop and mobile devices, and ready for deployment with the frontend on **Vercel** and backend on **Render**.

---

## ✨ Features

### 👤 1. Authentication & Profiles
- **User Accounts**: Create account with unique username, password, confirm password, and optional profile picture.
- **Avatar Support**: Choose from preset bottts avatars or upload custom profile pictures (PNG/JPG/SVG).
- **Session Persistence**: JWT-based authentication stored in `localStorage` with automatic re-login on refresh.

### 🏠 2. Rooms & Matchmaking
- **Host Games**: Set room name, maximum players (2–8), and choose **Public** or **Private**.
- **Public Rooms**: Real-time browser displaying active rooms, player counts, and host names.
- **Private Rooms**: Hidden from public listing; require a password.
- **Unique Password Requirement**: Active private rooms must have unique passwords as required by the specification.
- **Join Game with Password**: Dedicated button & modal allowing users to enter a password and jump directly into the private room.

### 🎙️ 3. Live Voice Chat & Messaging
- **WebRTC Voice Chat**: Peer-to-peer audio mesh with automatic voice activity detection (VAD).
- **Mic Controls**: Easy mute/unmute and disable voice chat buttons.
- **Visual Audio Waves**: Speaking indicator illuminates player badges in real time.
- **Live In-Game Chat**: Slide-out live chat for quick banter and system announcements.
- **Mute Messages**: Ability to mute or disable live messages anytime with a single toggle.

### 🎲 4. Standard UNO Rules Engine
- **Deck of 108 Cards**:
  - 4 Colors: Red, Yellow, Green, Blue.
  - Numbers 0–9, Skip, Reverse, Draw Two (+2), Wild, and Wild Draw Four (+4).
- **Finishing Card Rule**: A match **cannot be finished with a Power card (Skip, Reverse, Draw Two) or Wild card (Wild, Wild Draw Four)**. The winning card must be a regular number card (0–9).
- **Turn Mechanics**: Clockwise/counter-clockwise direction tracking, 2-player reverse rule (functions as skip), skips, draw cards, and wild color selector.
- **Take Card (Draw)**: "Take a Card" button active during the player's turn.
- **Optional "CALL UNO" & "CALL CHECK"**:
  - Buttons are completely neutral, subtle, and free of any pulsing or spoilers.
  - Players must visually observe opponents. If someone forgets to call UNO with 1 card and opponents also fail to notice, play continues and that player can play their last number card to win!
  - If an opponent notices while the player holds 1 card without having called UNO, pressing **CALL CHECK** applies standard rules and forces the player to draw 2 penalty cards. If pressed when no one is vulnerable, only the caller receives quiet feedback without alerting other players.

### 🪐 5. 3D Table & Visuals (Three.js)
- **Circular Gaming Table**: 3D casino felt table with dynamic spotlighting and rim bevel.
- **3D Player Avatars**: Other players sit around the circular table with stylized 3D avatar busts, name badges, turn halos, and **a physical 3D fan of cards** held in front of their avatar.
- **Visible Card Counts**: Billboards floating above avatars clearly indicate how many cards each opponent is holding (e.g. `🂠 5 cards`).
- **360° Look-Around Controls**: Drag with mouse (or swipe on mobile) to look around the circular table and observe all players.
- **Playable Card Highlights**: When it's your turn, playable cards lift up with vibrant glowing borders; unplayable cards are dimmed and disabled.
- **Show / Hide Hand Drawer**: "Hide Hand" button collapses your cards so you can look around the 3D room and opponents unobstructed; click "Show My Cards" to bring the fan back up.
- **Topmost Card HUD**: High-contrast, clear 2D display on the screen showing the current top card, active color, and turn direction.
- **3D Card Discard & Draw Piles**: Center table holds the 3D draw deck and realistic discard pile with active top card texture.
- **Victory Celebration**: Fanfare sound effect and full-screen confetti bursts when a player wins.

---

## 🛠️ Tech Stack

- **Frontend**:
  - React 19 + TypeScript
  - Vite 8
  - Three.js (WebGL 3D Rendering)
  - Tailwind CSS v4
  - Lucide React (Crisp gaming icons)
  - Canvas Confetti
  - Native Web Audio API Synthesizer (Instant latency-free sound effects)
- **Backend**:
  - Node.js + Express
  - TypeScript
  - Socket.IO 4.8 (Real-time events & WebRTC signaling)
  - MongoDB Atlas via Mongoose (with in-memory fallback store for local testing)
  - Bcrypt.js (Password hashing)
  - JSON Web Tokens (JWT)

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Node.js >= 18 (Node 24 tested)
- npm >= 9

### 2. Install Dependencies
From the repository root:
```bash
# Install root, server, and client dependencies
npm install
npm install --prefix server
npm install --prefix client
```

### 3. Configure Environment Variables
- In `server/.env` (optional, defaults provided):
  ```env
  PORT=5000
  MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/uno_online?retryWrites=true&w=majority
  JWT_SECRET=your_jwt_secret_key_here
  CLIENT_URL=http://localhost:5173
  ```
  *(Note: If `MONGODB_URI` is not set, the server runs with a high-performance in-memory store so you can test immediately without setting up a database!)*

- In `client/.env.local`:
  ```env
  # For local development with Vite proxy, leave empty or set to:
  VITE_BACKEND_URL=http://localhost:5000
  ```

### 4. Run Both Client & Server Concurrently
```bash
npm run dev
```
- Frontend will open at: `http://localhost:5173`
- Backend API & WebSockets run at: `http://localhost:5000`

---

## ☁️ Deployment Guide

### Deploy Backend to Render

1. Create a free account at [render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Configure the settings:
   - **Name**: `uno-online-backend`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render sets this automatically)
   - `MONGODB_URI`: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/uno_online?retryWrites=true&w=majority`
   - `JWT_SECRET`: `your_random_secure_secret_string`
6. Click **Create Web Service**. Note your Render URL (e.g., `https://uno-online-backend.onrender.com`).
   - Health check endpoint: `/api/health`

---

### Deploy Frontend to Vercel

1. Create a free account at [vercel.com](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. In the project configuration:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Under **Environment Variables**, add:
   - `VITE_BACKEND_URL`: `https://your-backend-app.onrender.com` (Your Render backend URL from above)
6. Click **Deploy**.
7. Vercel will deploy the client and provide a public URL (e.g. `https://uno-online.vercel.app`).
   - Single-page application rewrites are pre-configured in `client/vercel.json`.

---

## 🎮 How to Play

1. **Sign Up / Log In**: Enter a username, password, confirm password, and pick/upload an avatar.
2. **Host a Room**:
   - Choose a room name.
   - Select **Public** (shows on lobby list) or **Private** (requires entering a password).
   - If private, set a unique room password.
3. **Join a Room**:
   - For public rooms, click **Join Table** in the room list.
   - For private rooms, click **Join Game with password** and enter the secret code.
4. **Lobby**:
   - Toggle **Voice Chat** or chat via **Live Messages**.
   - When at least 2 players have joined, the host clicks **START UNO MATCH**.
5. **Gameplay**:
   - The circular table displays all players with their 3D card fans and card count badges.
   - Drag anywhere on the screen to look around 360°.
   - When it's your turn, playable cards glow with hover lift. Click a card to play it.
   - If playing Wild or +4, select the next active color.
   - Click **Take a Card** if you have no playable cards.
   - Click **Hide Hand** to close your card drawer and observe the room; click **Show My Cards** to bring it back.
   - If you or anyone reaches 1 card, remember to click **CALL UNO!**
   - If an opponent holds 1 card without calling UNO, click **CALL CHECK!** to catch them and force them to draw 2 penalty cards!
   - The first player to discard all their cards wins the game!

