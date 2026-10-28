import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameState, Player, UnoCard } from '../types';
import { socket } from '../services/socket';

interface UnoScene3DProps {
  gameState: GameState;
  myPlayerId: string;
  myUserId?: string;
}

// Texture Caches to prevent GPU memory bloat & re-drawing on every frame
const cardTextureCache = new Map<string, THREE.CanvasTexture>();
const avatarTextureCache = new Map<string, THREE.CanvasTexture>();

// Procedural Card Canvas Texture Generator (Cached)
function createCardTexture(card: UnoCard | null, isBack: boolean = false): THREE.CanvasTexture {
  const cacheKey = isBack || !card ? 'back' : `${card.color}_${card.type}_${card.value}`;
  const cached = cardTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  // Background
  if (isBack || !card) {
    ctx.fillStyle = '#111827'; // Dark Uno card back
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Red oval
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.beginPath();
    ctx.ellipse(0, 0, 95, 65, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#facc15';
    ctx.stroke();

    // UNO text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold italic 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UNO', 0, 0);
    ctx.restore();

    // Border
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  } else {
    // Face card
    let bgColor = '#dc2626';
    if (card.color === 'yellow') bgColor = '#eab308';
    if (card.color === 'green') bgColor = '#16a34a';
    if (card.color === 'blue') bgColor = '#2563eb';
    if (card.color === 'wild') bgColor = '#1f2937';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Oval center
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.beginPath();
    ctx.ellipse(0, 0, 90, 60, 0, 0, Math.PI * 2);
    ctx.fillStyle = card.color === 'wild' ? '#374151' : '#ffffff';
    ctx.fill();
    ctx.restore();

    // Center symbol
    ctx.fillStyle = card.color === 'wild' ? '#ffffff' : bgColor;
    ctx.font = 'bold italic 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let label = '';
    if (card.type === 'number') label = card.value.toString();
    else if (card.type === 'skip') label = '⊘';
    else if (card.type === 'reverse') label = '⇄';
    else if (card.type === 'draw2') label = '+2';
    else if (card.type === 'wild') label = 'WILD';
    else if (card.type === 'wild4') label = '+4';

    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    // Corner labels
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 18, 38);

    ctx.save();
    ctx.translate(canvas.width - 18, canvas.height - 18);
    ctx.rotate(Math.PI);
    ctx.fillText(label, 0, 20);
    ctx.restore();

    // Border
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  cardTextureCache.set(cacheKey, texture);
  return texture;
}

// Procedural Humanoid Avatar Face Texture Generator (Cached)
function createAvatarTexture(avatarUrl?: string, username: string = 'Player'): THREE.CanvasTexture {
  const cacheKey = avatarUrl || username;
  const cached = avatarTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Default user initial placeholder (clean fallback before async avatar image loads)
  function drawFallbackHumanoid() {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 256);

    // Outer circle
    ctx.beginPath();
    ctx.arc(128, 128, 116, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // User initial
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(username.charAt(0).toUpperCase(), 128, 128);
  }

  drawFallbackHumanoid();

  const texture = new THREE.CanvasTexture(canvas);

  const effectiveUrl =
    avatarUrl && (avatarUrl.startsWith('data:') || avatarUrl.startsWith('http'))
      ? avatarUrl
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}&backgroundColor=b6e3f4`;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.save();
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, 256, 256);
    ctx.restore();

    // Glowing border ring
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    texture.needsUpdate = true;
  };
  img.src = effectiveUrl;

  texture.needsUpdate = true;
  avatarTextureCache.set(cacheKey, texture);
  return texture;
}

// Procedural 2D Solid Badge Texture for Floating Player Info (Overhead Name Title)
function createBadgeTexture(player: Player, isTurn: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 120;
  const ctx = canvas.getContext('2d')!;

  // 100% Solid opaque background - no transparency / no glassmorphism
  ctx.fillStyle = isTurn ? '#0284c7' : '#0f172a';
  ctx.beginPath();
  ctx.roundRect(8, 8, 368, 104, 20);
  ctx.fill();

  // Solid crisp border
  ctx.lineWidth = isTurn ? 6 : 4;
  ctx.strokeStyle = isTurn ? '#facc15' : '#475569';
  ctx.stroke();

  // If isTurn, draw a golden banner at top
  if (isTurn) {
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★ CURRENT TURN ★', 192, 38);
  }

  // Username
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(player.username, 192, isTurn ? 84 : 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// Vibrant clothing color palette for seated avatars
const CLOTHING_COLORS = [
  0xdc2626, // Crimson Red
  0x2563eb, // Royal Blue
  0x059669, // Emerald Green
  0xd97706, // Amber Gold
  0x7c3aed, // Purple
  0x0891b2, // Cyan
  0xe11d48, // Rose Pink
  0x4f46e5, // Indigo
];

// Rig interface so head & body can rotate dynamically when player looks around
interface HumanoidModelRig {
  group: THREE.Group;
  headGroup: THREE.Group;
  bodyGroup: THREE.Group;
  fanGroup: THREE.Group;
  sprite: THREE.Sprite;
  halo: THREE.Mesh;
  leftRing: THREE.Mesh;
  rightRing: THREE.Mesh;
  cardCount: number;
  isTurn: boolean;
  colorIndex: number;
  player: Player;
}

// Reusable immutable geometry for held cards (prevents allocation spikes)
const sharedHeldCardGeo = new THREE.PlaneGeometry(0.72, 1.08);

// Rebuild or update the fan of cards held in hands
function rebuildCardFan(fanGroup: THREE.Group, cardCount: number, cardBackMat: THREE.Material, isMobile: boolean = false) {
  while (fanGroup.children.length > 0) {
    fanGroup.remove(fanGroup.children[0]);
  }
  const cardsInHand = Math.min(cardCount, 8);

  for (let c = 0; c < cardsInHand; c++) {
    const cardHolder = new THREE.Group();
    const fanOffset = (c - (cardsInHand - 1) / 2) * 0.11;
    const fanRotZ = (c - (cardsInHand - 1) / 2) * -0.09;

    cardHolder.position.set(fanOffset, 0.44, c * -0.008);
    // Natural tilt: top of card leans back towards player's chest (+Z)
    cardHolder.rotation.x = 0.26;
    // Fanning arc around Z axis
    cardHolder.rotation.z = fanRotZ;

    const cardMesh = new THREE.Mesh(sharedHeldCardGeo, cardBackMat);
    // Face the viewer (-Z) upright with no horizontal or vertical mirroring
    cardMesh.rotation.y = Math.PI;
    if (!isMobile) {
      cardMesh.castShadow = true;
    }
    cardHolder.add(cardMesh);

    fanGroup.add(cardHolder);
  }
}

// Helper to construct a detailed 3D Humanoid Player Model seated in a gaming/casino chair
function createHumanoidPlayerModel(
  player: Player,
  isTurn: boolean,
  colorIndex: number,
  cardBackMat: THREE.Material,
  isMobile: boolean = false
): HumanoidModelRig {
  const group = new THREE.Group();

  // ==========================================
  // 1. CASINO / GAMING CHAIR (Facing table)
  // In local coordinates: +Z is behind, -Z is facing table
  // ==========================================
  const chairGroup = new THREE.Group();

  // Seat Cushion
  const seatGeo = new THREE.CylinderGeometry(0.85, 0.9, 0.22, 28);
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x161922,
    roughness: 0.5,
    metalness: 0.15,
  });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.y = 0.11;
  if (!isMobile) seat.castShadow = true;
  seat.receiveShadow = true;
  chairGroup.add(seat);

  // Chair Backrest (High-back executive gaming chair)
  const backGeo = new THREE.BoxGeometry(1.25, 1.75, 0.18);
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x1e2433,
    roughness: 0.45,
    metalness: 0.15,
  });
  const back = new THREE.Mesh(backGeo, backMat);
  back.position.set(0, 1.1, 0.65); // behind player (+Z)
  back.rotation.x = 0.08; // natural recline
  back.castShadow = true;
  chairGroup.add(back);

  // Chair Headrest
  const headrestGeo = new THREE.BoxGeometry(0.9, 0.45, 0.22);
  const headrestMat = new THREE.MeshStandardMaterial({
    color: 0x111620,
    roughness: 0.4,
  });
  const headrest = new THREE.Mesh(headrestGeo, headrestMat);
  headrest.position.set(0, 1.98, 0.72);
  if (!isMobile) headrest.castShadow = true;
  chairGroup.add(headrest);

  // Metallic Armrests
  const armrestMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
  const leftArmrest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.7), armrestMat);
  leftArmrest.position.set(-0.72, 0.65, 0.15);
  chairGroup.add(leftArmrest);

  const rightArmrest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.7), armrestMat);
  rightArmrest.position.set(0.72, 0.65, 0.15);
  chairGroup.add(rightArmrest);

  group.add(chairGroup);

  // ==========================================
  // 2. HUMANOID BODY & CLOTHING (Can rotate slightly with gaze)
  // ==========================================
  const bodyGroup = new THREE.Group();

  const clothColor = CLOTHING_COLORS[colorIndex % CLOTHING_COLORS.length];
  const clothMat = new THREE.MeshStandardMaterial({
    color: clothColor,
    roughness: 0.6,
  });

  // Torso / Jacket
  const torsoGeo = new THREE.CylinderGeometry(0.46, 0.58, 1.05, isMobile ? 16 : 24);
  const torso = new THREE.Mesh(torsoGeo, clothMat);
  torso.position.y = 0.75;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Shoulders (rounded bar)
  const shouldersGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.15, 14);
  shouldersGeo.rotateZ(Math.PI / 2);
  const shoulders = new THREE.Mesh(shouldersGeo, clothMat);
  shoulders.position.set(0, 1.25, 0.02);
  if (!isMobile) shoulders.castShadow = true;
  bodyGroup.add(shoulders);

  // Arms extending forward towards table
  const armGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.68, 14);
  armGeo.rotateX(-Math.PI / 3.8); // angled forward towards table edge

  const leftArm = new THREE.Mesh(armGeo, clothMat);
  leftArm.position.set(-0.52, 0.95, -0.22);
  if (!isMobile) leftArm.castShadow = true;
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, clothMat);
  rightArm.position.set(0.52, 0.95, -0.22);
  if (!isMobile) rightArm.castShadow = true;
  bodyGroup.add(rightArm);

  // Hands (skin tone) holding the cards
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d0b0, roughness: 0.5 });
  const handGeo = new THREE.SphereGeometry(0.12, 12, 12);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(-0.24, 0.64, -0.56);
  bodyGroup.add(leftHand);

  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.set(0.24, 0.64, -0.56);
  bodyGroup.add(rightHand);

  // 3D Fan of Cards held in hands (Upright, tilted naturally back towards player's chest)
  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, 0.66, -0.55); // centered at player's hands
  rebuildCardFan(fanGroup, player.cardCount, cardBackMat, isMobile);
  bodyGroup.add(fanGroup);

  group.add(bodyGroup);

  // ==========================================
  // 3. HUMANOID HEAD & HEADSET (Pivots with player gaze)
  // Pivot placed at base of neck (y = 1.45)
  // ==========================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.45, 0);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.25, 16);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.05;
  headGroup.add(neck);

  // Head base
  const headGeo = new THREE.SphereGeometry(0.44, 32, 24);
  headGeo.scale(1, 1.15, 0.95);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 0.37, 0);
  head.castShadow = true;
  headGroup.add(head);

  // Face Display (Curved seamlessly along the front of the head)
  const avatarTex = createAvatarTexture(player.avatar, player.username);
  // Curved front shell geometry matching the head's exact curvature
  const faceGeo = new THREE.SphereGeometry(
    0.446,
    32,
    16,
    Math.PI * 1.18,
    Math.PI * 0.64,
    Math.PI * 0.24,
    Math.PI * 0.52
  );
  const faceMat = new THREE.MeshStandardMaterial({
    map: avatarTex,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, 0.37, 0);
  headGroup.add(face);

  // Gamer Headset Band (Arching cleanly OVER the top of the head)
  const bandGeo = new THREE.TorusGeometry(0.48, 0.045, 12, 32, Math.PI);
  // TorusGeometry with arc=Math.PI arches naturally from -X through +Y to +X over the head
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.set(0, 0.37, 0);
  headGroup.add(band);

  // Soft Headband Cushion on top of head
  const padGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.42, 16);
  padGeo.rotateZ(Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.set(0, 0.85, 0);
  headGroup.add(pad);

  // Earcups
  const cupGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24);
  cupGeo.rotateZ(Math.PI / 2);

  const ledColor = isTurn ? 0x38bdf8 : 0x0284c7;
  const cupMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
  });

  const leftCup = new THREE.Mesh(cupGeo, cupMat);
  leftCup.position.set(-0.48, 0.37, 0);
  headGroup.add(leftCup);

  const rightCup = new THREE.Mesh(cupGeo, cupMat);
  rightCup.position.set(0.48, 0.37, 0);
  headGroup.add(rightCup);

  // Glowing LED Status Rings on outside faces of earcups
  const ringGeo = new THREE.RingGeometry(0.07, 0.13, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ledColor,
    side: THREE.DoubleSide,
  });

  const leftRing = new THREE.Mesh(ringGeo, ringMat);
  leftRing.position.set(-0.55, 0.37, 0);
  leftRing.rotation.y = -Math.PI / 2;
  headGroup.add(leftRing);

  const rightRing = new THREE.Mesh(ringGeo, ringMat);
  rightRing.position.set(0.55, 0.37, 0);
  rightRing.rotation.y = Math.PI / 2;
  headGroup.add(rightRing);

  group.add(headGroup);

  // ==========================================
  // 4. TURN GLOW & HALO (Always attached, visibility toggled with isTurn)
  // ==========================================
  const haloGeo = new THREE.RingGeometry(0.95, 1.25, 32);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.y = 0.01;
  halo.visible = isTurn;
  group.add(halo);

  // ==========================================
  // 5. FLOATING 2D INFO BADGE (Username & Card Count)
  // In Three.js, a Sprite always faces the camera directly
  // ==========================================
  const badgeTex = createBadgeTexture(player, isTurn);
  const spriteMat = new THREE.SpriteMaterial({ map: badgeTex });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, 2.95, 0);
  sprite.scale.set(2.2, 0.69, 1);
  group.add(sprite);

  return {
    group,
    headGroup,
    bodyGroup,
    fanGroup,
    sprite,
    halo,
    leftRing,
    rightRing,
    cardCount: player.cardCount,
    isTurn,
    colorIndex,
    player,
  };
}

export const UnoScene3D: React.FC<UnoScene3DProps> = ({ gameState, myPlayerId, myUserId }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const discardCardMeshRef = useRef<THREE.Mesh | null>(null);
  const drawPileGroupRef = useRef<THREE.Group | null>(null);
  const playersGroupRef = useRef<THREE.Group | null>(null);
  const [sceneReady, setSceneReady] = React.useState(false);

  // Persistent look angles across state updates: playerId -> { targetYaw, targetPitch, currentYaw, currentPitch }
  const persistentLookAngles = useRef<
    Map<
      string,
      {
        targetYaw: number;
        targetPitch: number;
        currentYaw: number;
        currentPitch: number;
      }
    >
  >(new Map());

  // Active player rigs map: playerId -> HumanoidModelRig (preserved across turns & card plays)
  const activeRigsMap = useRef<Map<string, HumanoidModelRig>>(new Map());
  const cardBackMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Opponents look tracking map: playerId -> { headGroup, bodyGroup, targetYaw, targetPitch, currentYaw, currentPitch }
  const opponentsLookMap = useRef<
    Map<
      string,
      {
        headGroup: THREE.Group;
        bodyGroup: THREE.Group;
        targetYaw: number;
        targetPitch: number;
        currentYaw: number;
        currentPitch: number;
      }
    >
  >(new Map());

  // First-Person Seated Look-Around State
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const lastEmittedLook = useRef({ yaw: 0, pitch: 0, time: 0 });

  // Fixed seat position of current player at table South
  const CAMERA_EYE_POSITION = new THREE.Vector3(0, 1.95, 5.4);

  // Clamped rotation angles: enough to look around at opponents without 360° spinning
  const YAW_MIN = -1.15; // ~ -66 degrees (left opponents)
  const YAW_MAX = 1.15;  // ~ +66 degrees (right opponents)
  const PITCH_MIN = -0.52; // ~ -30 degrees (down towards cards)
  const PITCH_MAX = 0.18;  // ~ +10 degrees (up towards faces)

  const DEFAULT_YAW = 0;
  const DEFAULT_PITCH = -0.22; // natural downward gaze towards cards & opponents

  const currentYaw = useRef(DEFAULT_YAW);
  const currentPitch = useRef(DEFAULT_PITCH);
  const targetYaw = useRef(DEFAULT_YAW);
  const targetPitch = useRef(DEFAULT_PITCH);

  // Reset view to dead-center
  const handleResetView = () => {
    targetYaw.current = DEFAULT_YAW;
    targetPitch.current = DEFAULT_PITCH;
    emitLook(DEFAULT_YAW, DEFAULT_PITCH, true);
  };

  // Helper to emit look angles to server
  const emitLook = (yaw: number, pitch: number, force = false) => {
    const now = performance.now();
    if (force || now - lastEmittedLook.current.time > 45) {
      const dy = Math.abs(yaw - lastEmittedLook.current.yaw);
      const dp = Math.abs(pitch - lastEmittedLook.current.pitch);
      if (force || dy > 0.01 || dp > 0.01) {
        lastEmittedLook.current = { yaw, pitch, time: now };
        socket.emit('player:look', { yaw, pitch });
      }
    }
  };

  // Sync other players' look-around head movements
  useEffect(() => {
    const onPlayerLooked = (payload: { playerId: string; yaw: number; pitch: number }) => {
      if (!payload?.playerId) return;

      // Update or store in persistent look angles
      const existing = persistentLookAngles.current.get(payload.playerId);
      if (existing) {
        existing.targetYaw = payload.yaw;
        existing.targetPitch = payload.pitch;
      } else {
        persistentLookAngles.current.set(payload.playerId, {
          targetYaw: payload.yaw,
          targetPitch: payload.pitch,
          currentYaw: payload.yaw,
          currentPitch: payload.pitch,
        });
      }

      const tracker = opponentsLookMap.current.get(payload.playerId);
      if (tracker) {
        tracker.targetYaw = payload.yaw;
        tracker.targetPitch = payload.pitch;
      }
    };

    const onPlayerAllLooks = (looks: Record<string, { yaw: number; pitch: number }>) => {
      if (!looks) return;
      Object.entries(looks).forEach(([playerId, look]) => {
        if (playerId === myPlayerId) return;
        const existing = persistentLookAngles.current.get(playerId);
        if (existing) {
          existing.targetYaw = look.yaw;
          existing.targetPitch = look.pitch;
        } else {
          persistentLookAngles.current.set(playerId, {
            targetYaw: look.yaw,
            targetPitch: look.pitch,
            currentYaw: look.yaw,
            currentPitch: look.pitch,
          });
        }
        const tracker = opponentsLookMap.current.get(playerId);
        if (tracker) {
          tracker.targetYaw = look.yaw;
          tracker.targetPitch = look.pitch;
        }
      });
    };

    socket.on('player:looked', onPlayerLooked);
    socket.on('player:all_looks', onPlayerAllLooks);
    socket.emit('player:get_looks');

    return () => {
      socket.off('player:looked', onPlayerLooked);
      socket.off('player:all_looks', onPlayerAllLooks);
    };
  }, [myPlayerId]);

  // Initialize Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#070b14');
    scene.fog = new THREE.FogExp2('#070b14', 0.03);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    cameraRef.current = camera;
    updateCameraLook();

    const isMobile = typeof navigator !== 'undefined' && (/mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent) || window.innerWidth < 768);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: false,
      powerPreference: 'high-performance',
      precision: isMobile ? 'mediump' : 'highp',
      stencil: false,
      depth: true,
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);

    // Limit DPR on mobile to 1.25 (or 1.5 max on wide tablets), 1.75 on desktop
    const maxDpr = isMobile ? (window.innerWidth < 500 ? 1.25 : 1.5) : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ==========================================
    // LIGHTING & AMBIANCE
    // ==========================================
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 1.1);
    dirLight.position.set(4, 10, 6);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = isMobile ? 512 : 1024;
    dirLight.shadow.mapSize.height = isMobile ? 512 : 1024;
    scene.add(dirLight);

    // Overhead Pendant Hanging Lamp with Spotlight
    const pendantLight = new THREE.SpotLight(0xfffaed, 2.5, 14, Math.PI / 3.2, 0.45, 1.2);
    pendantLight.position.set(0, 5.5, 0);
    pendantLight.target.position.set(0, 0, 0);
    pendantLight.castShadow = !isMobile;
    if (!isMobile) {
      pendantLight.shadow.mapSize.width = 512;
      pendantLight.shadow.mapSize.height = 512;
    }
    scene.add(pendantLight);
    scene.add(pendantLight.target);

    // Subtle table point light
    const tablePointLight = new THREE.PointLight(0x60a5fa, 0.5, 8);
    tablePointLight.position.set(0, 2.8, 0);
    scene.add(tablePointLight);

    // Pendant Lamp Mesh
    const lampGroup = new THREE.Group();
    lampGroup.position.set(0, 5.2, 0);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x111827 })
    );
    cord.position.y = 1.25;
    lampGroup.add(cord);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 0.45, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 })
    );
    shade.position.y = 0;
    lampGroup.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffedd5 })
    );
    bulb.position.y = -0.1;
    lampGroup.add(bulb);

    scene.add(lampGroup);

    // ==========================================
    // FLOOR & CASINO RUG
    // ==========================================
    // Room Floor (Dark wood/slate)
    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      roughness: 0.8,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    floor.receiveShadow = true;
    scene.add(floor);

    // Circular Casino Velvet Rug under table & chairs
    const rugGeo = new THREE.CylinderGeometry(8.5, 8.5, 0.02, 48);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x0b192c,
      roughness: 0.9,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.position.y = -1.79;
    rug.receiveShadow = true;
    scene.add(rug);

    // ==========================================
    // CIRCULAR UNO TABLE
    // ==========================================
    const tableGroup = new THREE.Group();

    // Table Felt (Rich Deep Navy/Casino Felt)
    const tableFeltGeo = new THREE.CylinderGeometry(5.0, 5.0, 0.4, 48);
    const tableFeltMat = new THREE.MeshStandardMaterial({
      color: 0x0f3460,
      roughness: 0.55,
      metalness: 0.1,
    });
    const tableFelt = new THREE.Mesh(tableFeltGeo, tableFeltMat);
    tableFelt.receiveShadow = true;
    tableFelt.position.y = -0.2;
    tableGroup.add(tableFelt);

    // Table Wooden Outer Rim (Rich Mahogany/Teak)
    const rimGeo = new THREE.TorusGeometry(5.1, 0.35, 16, 48);
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x4a2810,
      roughness: 0.35,
      metalness: 0.2,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -0.05;
    tableGroup.add(rim);

    // Table Pedestal Leg
    const legGeo = new THREE.CylinderGeometry(1.4, 2.2, 3, 32);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.y = -1.7;
    tableGroup.add(leg);

    scene.add(tableGroup);

    // ==========================================
    // DRAW PILE & DISCARD PILE (Positioned in front)
    // ==========================================
    const cardGeo = new THREE.BoxGeometry(1.15, 0.02, 1.75);
    const cardBackTex = createCardTexture(null, true);
    const cardBackMat = new THREE.MeshStandardMaterial({
      map: cardBackTex,
      roughness: 0.3,
    });

    // Draw Pile (Stacked cards on the left of table center)
    const drawPileGroup = new THREE.Group();
    drawPileGroup.position.set(-0.85, 0.05, 0);

    for (let i = 0; i < 12; i++) {
      const cardMesh = new THREE.Mesh(cardGeo, cardBackMat);
      cardMesh.position.set((Math.random() - 0.5) * 0.02, i * 0.025, (Math.random() - 0.5) * 0.02);
      cardMesh.rotation.y = (Math.random() - 0.5) * 0.08;
      // Only the top card of the draw pile casts/receives shadow
      cardMesh.castShadow = (i === 11);
      cardMesh.receiveShadow = (i === 11);
      drawPileGroup.add(cardMesh);
    }
    scene.add(drawPileGroup);
    drawPileGroupRef.current = drawPileGroup;

    // Discard Pile (Top card on the right of table center)
    const discardCardMat = new THREE.MeshStandardMaterial({
      map: createCardTexture(gameState.topCard),
      roughness: 0.3,
    });
    const discardCardMesh = new THREE.Mesh(cardGeo, discardCardMat);
    discardCardMesh.position.set(0.85, 0.05, 0);
    discardCardMesh.rotation.y = -Math.PI / 12;
    discardCardMesh.castShadow = true;
    discardCardMesh.receiveShadow = true;
    scene.add(discardCardMesh);
    discardCardMeshRef.current = discardCardMesh;

    // Players group container
    const playersGroup = new THREE.Group();
    scene.add(playersGroup);
    playersGroupRef.current = playersGroup;
    setSceneReady(true);

    // Window Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      const isMob = typeof navigator !== 'undefined' && (/mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent) || window.innerWidth < 768);
      const maxD = isMob ? (window.innerWidth < 500 ? 1.25 : 1.5) : 1.75;
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, maxD));
    };
    window.addEventListener('resize', handleResize);

    // ==========================================
    // FIRST-PERSON LOOK-AROUND CONTROLS
    // ==========================================
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
      isDragging.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      targetYaw.current = Math.max(YAW_MIN, Math.min(YAW_MAX, targetYaw.current - deltaX * 0.005));
      targetPitch.current = Math.max(PITCH_MIN, Math.min(PITCH_MAX, targetPitch.current + deltaY * 0.005));

      previousMousePosition.current = { x: e.clientX, y: e.clientY };
      emitLook(targetYaw.current, targetPitch.current);
    };

    const onMouseUp = () => {
      if (isDragging.current) {
        emitLook(targetYaw.current, targetPitch.current, true);
      }
      isDragging.current = false;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        previousMousePosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - previousMousePosition.current.x;
      const deltaY = e.touches[0].clientY - previousMousePosition.current.y;

      targetYaw.current = Math.max(YAW_MIN, Math.min(YAW_MAX, targetYaw.current - deltaX * 0.006));
      targetPitch.current = Math.max(PITCH_MIN, Math.min(PITCH_MAX, targetPitch.current + deltaY * 0.006));

      previousMousePosition.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      emitLook(targetYaw.current, targetPitch.current);
    };

    const onTouchEnd = () => {
      if (isDragging.current) {
        emitLook(targetYaw.current, targetPitch.current, true);
      }
      isDragging.current = false;
    };

    const onDoubleClick = () => {
      handleResetView();
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    container.addEventListener('dblclick', onDoubleClick);

    // Animation Loop
    let animId: number;
    let lastRenderTime = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Background tab throttling to save battery and GPU cycles
      const now = performance.now();
      if (document.hidden && now - lastRenderTime < 100) {
        return;
      }
      lastRenderTime = now;

      // Smooth local head turn interpolation (lerp damping)
      currentYaw.current += (targetYaw.current - currentYaw.current) * 0.14;
      currentPitch.current += (targetPitch.current - currentPitch.current) * 0.14;

      updateCameraLook();

      // Broadcast local look updates at smooth intervals
      emitLook(currentYaw.current, currentPitch.current);

      // Smoothly animate opponents' head and body rotations to match where they are looking
      opponentsLookMap.current.forEach(tracker => {
        tracker.currentYaw += (tracker.targetYaw - tracker.currentYaw) * 0.12;
        tracker.currentPitch += (tracker.targetPitch - tracker.currentPitch) * 0.12;

        if (tracker.headGroup) {
          // -currentYaw rotates head left/right in model coordinates
          tracker.headGroup.rotation.y = -tracker.currentYaw * 0.85;
          // currentPitch tilts head up/down
          tracker.headGroup.rotation.x = tracker.currentPitch * 0.75;
        }
        if (tracker.bodyGroup) {
          // Torso follows head subtly
          tracker.bodyGroup.rotation.y = -tracker.currentYaw * 0.35;
        }
      });

      // Breathing animation on table light
      if (sceneRef.current) {
        const time = clock.getElapsedTime();
        tablePointLight.intensity = 0.5 + Math.sin(time * 2) * 0.15;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      setSceneReady(false);
      activeRigsMap.current.clear();
      opponentsLookMap.current.clear();
      playersGroupRef.current = null;
      drawPileGroupRef.current = null;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('dblclick', onDoubleClick);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Camera Look direction based on first-person seated yaw & pitch
  function updateCameraLook() {
    if (!cameraRef.current) return;
    const yaw = currentYaw.current;
    const pitch = currentPitch.current;

    const forwardX = Math.sin(yaw) * Math.cos(pitch);
    const forwardY = Math.sin(pitch);
    const forwardZ = -Math.cos(yaw) * Math.cos(pitch);

    cameraRef.current.position.copy(CAMERA_EYE_POSITION);
    cameraRef.current.lookAt(
      CAMERA_EYE_POSITION.x + forwardX * 10,
      CAMERA_EYE_POSITION.y + forwardY * 10,
      CAMERA_EYE_POSITION.z + forwardZ * 10
    );
  }

  // Update Top Card texture when state changes
  useEffect(() => {
    if (discardCardMeshRef.current && gameState.topCard) {
      const tex = createCardTexture(gameState.topCard);
      (discardCardMeshRef.current.material as THREE.MeshStandardMaterial).map = tex;
      (discardCardMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
  }, [gameState.topCard]);

  // Update Draw Pile 3D stack thickness when deck count changes
  useEffect(() => {
    if (!drawPileGroupRef.current) return;
    const count = gameState.drawPileCount ?? 108;
    const numCardsToShow = count === 0 ? 0 : Math.min(12, Math.max(1, Math.ceil(count / 8)));
    drawPileGroupRef.current.children.forEach((child, idx) => {
      child.visible = idx < numCardsToShow;
    });
  }, [gameState.drawPileCount]);

  // Update Seated Humanoid Avatars around table
  useEffect(() => {
    if (!sceneReady || !playersGroupRef.current) return;
    const playersGroup = playersGroupRef.current;

    const players = gameState.players;
    const numPlayers = players.length;
    if (numPlayers === 0) {
      // Clear all rigs if no players
      while (playersGroup.children.length > 0) {
        playersGroup.remove(playersGroup.children[0]);
      }
      activeRigsMap.current.clear();
      opponentsLookMap.current.clear();
      return;
    }

    if (!cardBackMatRef.current) {
      const cardBackTex = createCardTexture(null, true);
      cardBackMatRef.current = new THREE.MeshStandardMaterial({ map: cardBackTex, roughness: 0.3 });
    }
    const cardBackMat = cardBackMatRef.current;

    // Order players so myPlayer is centered at bottom angle (theta = PI / 2)
    const myIndex = players.findIndex(
      p => (myPlayerId && p.id === myPlayerId) || (myUserId && p.userId === myUserId)
    );
    const sortedPlayers = [...players];
    if (myIndex > 0) {
      const mine = sortedPlayers.splice(myIndex, 1)[0];
      sortedPlayers.unshift(mine);
    }

    const radius = 5.3; // Table edge distance
    const currentActiveIds = new Set<string>();
    const isMobile = typeof navigator !== 'undefined' && (/mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent) || window.innerWidth < 768);

    sortedPlayers.forEach((player, i) => {
      // In First-Person POV, your own avatar (index 0) is NOT rendered in front of your own eyes
      const isMe = (myPlayerId && player.id === myPlayerId) || (myUserId && player.userId === myUserId);
      if (isMe) return;

      currentActiveIds.add(player.id);
      const isTurn = player.id === gameState.currentTurnPlayerId;
      const angle = (i / numPlayers) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Look up existing rig by player.id or player.userId (preserves rig across socket reconnects)
      let existingRig = activeRigsMap.current.get(player.id);
      if (!existingRig && player.userId) {
        for (const [id, r] of activeRigsMap.current.entries()) {
          if (r.player.userId === player.userId) {
            existingRig = r;
            activeRigsMap.current.delete(id);
            activeRigsMap.current.set(player.id, existingRig);
            break;
          }
        }
      }

      if (existingRig) {
        // Guarantee the rig's 3D group is attached to the active scene's playersGroup!
        if (!playersGroup.children.includes(existingRig.group)) {
          playersGroup.add(existingRig.group);
        }

        // Update in-place so head & body look direction are NEVER reset!
        existingRig.group.position.set(x, 0.0, z);
        existingRig.group.lookAt(0, 0.0, 0);
        existingRig.group.rotateY(Math.PI);

        // Update card fan if card count changed
        if (existingRig.cardCount !== player.cardCount) {
          rebuildCardFan(existingRig.fanGroup, player.cardCount, cardBackMat, isMobile);
          existingRig.cardCount = player.cardCount;
        }

        // Update turn glow halo, LED status rings, and badge texture
        if (existingRig.isTurn !== isTurn) {
          existingRig.isTurn = isTurn;
          existingRig.halo.visible = isTurn;
          (existingRig.leftRing.material as THREE.MeshBasicMaterial).color.setHex(isTurn ? 0x38bdf8 : 0x0284c7);
          (existingRig.rightRing.material as THREE.MeshBasicMaterial).color.setHex(isTurn ? 0x38bdf8 : 0x0284c7);
          existingRig.sprite.material.map = createBadgeTexture(player, isTurn);
          existingRig.sprite.material.needsUpdate = true;
        }
      } else {
        // New player rig: construct model
        const rig = createHumanoidPlayerModel(player, isTurn, i, cardBackMat, isMobile);
        rig.group.position.set(x, 0.0, z);
        rig.group.lookAt(0, 0.0, 0);
        rig.group.rotateY(Math.PI);

        // Recover any known persistent look angle so the avatar never spawns facing dead-center if already looking away
        const savedLook = persistentLookAngles.current.get(player.id) ||
          (player.userId ? persistentLookAngles.current.get(player.userId) : undefined) || {
            targetYaw: 0,
            targetPitch: 0,
            currentYaw: 0,
            currentPitch: 0,
          };

        // Immediately orient the head and body to the saved direction
        rig.headGroup.rotation.y = -savedLook.currentYaw * 0.85;
        rig.headGroup.rotation.x = savedLook.currentPitch * 0.75;
        rig.bodyGroup.rotation.y = -savedLook.currentYaw * 0.35;

        playersGroup.add(rig.group);
        activeRigsMap.current.set(player.id, rig);

        opponentsLookMap.current.set(player.id, {
          headGroup: rig.headGroup,
          bodyGroup: rig.bodyGroup,
          targetYaw: savedLook.targetYaw,
          targetPitch: savedLook.targetPitch,
          currentYaw: savedLook.currentYaw,
          currentPitch: savedLook.currentPitch,
        });
      }
    });

    // Remove any disconnected players who left the room
    activeRigsMap.current.forEach((rig, playerId) => {
      if (!currentActiveIds.has(playerId)) {
        playersGroup.remove(rig.group);
        activeRigsMap.current.delete(playerId);
        opponentsLookMap.current.delete(playerId);
      }
    });
  }, [gameState.players, gameState.currentTurnPlayerId, myPlayerId, myUserId, sceneReady]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};

export default UnoScene3D;
