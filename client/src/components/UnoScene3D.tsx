import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameState, Player, UnoCard } from '../types';
import { socket } from '../services/socket';
import { sounds } from '../services/audio';

interface UnoScene3DProps {
  gameState: GameState;
  myPlayerId: string;
  myUserId?: string;
}

// Texture Caches to prevent GPU memory bloat & re-drawing on every frame
const cardTextureCache = new Map<string, THREE.CanvasTexture>();
const playerAvatarImageMap = new Map<string, HTMLImageElement>();
let cuteFaceTexture: THREE.CanvasTexture | null = null;

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

// Procedural Goofy & Neutral Cartoon Eyes Face Texture (512x512 Canvas with transparent background)
function getCuteFaceTexture(): THREE.CanvasTexture {
  if (cuteFaceTexture) return cuteFaceTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);

  // Helper for drawing one big goofy cartoon eye (neutral, bold, derpy)
  function drawEye(cx: number, cy: number, isLeft: boolean) {
    ctx.save();

    // 1. Sclera: Big bold cartoon eye (solid white with thick dark outline)
    const rx = 46;
    const ry = 56;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // 2. Pupil: Bold dark circular pupil (slightly derpy/inward gaze for goofy charm)
    const pupilOffsetX = isLeft ? 6 : -6;
    const pupilOffsetY = 2;
    const px = cx + pupilOffsetX;
    const py = cy + pupilOffsetY;
    const prx = 22;
    const pry = 26;

    ctx.beginPath();
    ctx.ellipse(px, py, prx, pry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // 3. Crisp cartoon reflection shine (clean, neutral, no eyelashes, no makeup)
    ctx.beginPath();
    ctx.arc(px - 7, py - 8, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px + 8, py + 8, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();

    ctx.restore();
  }

  // Draw left and right eyes
  drawEye(172, 230, true);
  drawEye(340, 230, false);

  // 4. Goofy expressive cartoon eyebrows (thick, friendly, slightly quizzical)
  function drawEyebrow(cx: number, cy: number, isLeft: boolean) {
    ctx.save();
    ctx.beginPath();
    if (isLeft) {
      // Slightly raised curious arch
      ctx.moveTo(cx - 38, cy + 4);
      ctx.quadraticCurveTo(cx - 5, cy - 22, cx + 38, cy - 6);
    } else {
      // Slightly relaxed / goofy arch
      ctx.moveTo(cx - 38, cy - 6);
      ctx.quadraticCurveTo(cx + 5, cy - 20, cx + 38, cy + 4);
    }
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    ctx.restore();
  }
  drawEyebrow(172, 142, true);
  drawEyebrow(340, 142, false);

  // 5. Goofy cheerful cartoon open grin (sitting comfortably above card hand)
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 310, 26, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();

  // Cute cartoon tongue peeking at the bottom
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 310, 26, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(256, 330, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#f43f5e';
  ctx.fill();
  ctx.restore();
  ctx.restore();

  cuteFaceTexture = new THREE.CanvasTexture(canvas);
  cuteFaceTexture.generateMipmaps = true;
  cuteFaceTexture.minFilter = THREE.LinearMipmapLinearFilter;
  cuteFaceTexture.needsUpdate = true;
  return cuteFaceTexture;
}

// Procedural 2D Solid Badge Texture for Floating Player Info with User Avatar Image & Name
function createBadgeTexture(player: Player, isTurn: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 460;
  canvas.height = 124;
  const ctx = canvas.getContext('2d')!;

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const effectiveUrl =
    player.avatar && (player.avatar.startsWith('data:') || player.avatar.startsWith('http'))
      ? player.avatar
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(player.username)}&backgroundColor=b6e3f4`;

  function render(avatarImg?: HTMLImageElement) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Solid opaque rounded badge background
    ctx.fillStyle = isTurn ? '#0284c7' : '#0f172a';
    ctx.beginPath();
    ctx.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 22);
    ctx.fill();

    // Solid crisp border
    ctx.lineWidth = isTurn ? 6 : 4;
    ctx.strokeStyle = isTurn ? '#facc15' : '#38bdf8';
    ctx.stroke();

    // 2. User Avatar in Circular Frame on the Left
    const cx = 64;
    const cy = 62;
    const r = 44;

    ctx.save();
    // Inner dark circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImg, cx - (r - 2), cy - (r - 2), (r - 2) * 2, (r - 2) * 2);
      ctx.restore();
    } else {
      // Clean fallback initial
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.username.charAt(0).toUpperCase(), cx, cy);
    }

    // Glowing avatar border ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = isTurn ? '#facc15' : '#38bdf8';
    ctx.stroke();
    ctx.restore();

    // 3. Player Name & Status on the Right (starting at x = 124)
    if (isTurn) {
      // Golden turn banner at top
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('★ CURRENT TURN ★', 124, 42);

      // Username below banner
      let fontSize = 34;
      ctx.font = `bold ${fontSize}px sans-serif`;
      while (ctx.measureText(player.username).width > 310 && fontSize > 18) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px sans-serif`;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(player.username, 124, 88);
    } else {
      // Username vertically centered
      let fontSize = 38;
      ctx.font = `bold ${fontSize}px sans-serif`;
      while (ctx.measureText(player.username).width > 310 && fontSize > 18) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px sans-serif`;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.username, 124, 62);
    }

    tex.needsUpdate = true;
  }

  // Check if image is already cached
  const existingImg = playerAvatarImageMap.get(effectiveUrl);
  if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
    render(existingImg);
  } else if (existingImg) {
    render();
    existingImg.addEventListener(
      'load',
      () => {
        render(existingImg);
      },
      { once: true }
    );
  } else {
    render();
    const newImg = new Image();
    newImg.crossOrigin = 'anonymous';
    newImg.src = effectiveUrl;
    playerAvatarImageMap.set(effectiveUrl, newImg);
    newImg.onload = () => {
      render(newImg);
    };
  }

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
  targetYaw: number;
  targetPitch: number;
  currentYaw: number;
  currentPitch: number;
}

// Reusable immutable geometry for held cards (prevents allocation spikes)
const sharedHeldCardGeo = new THREE.PlaneGeometry(0.72, 1.08);

// Reusable immutable geometry for 3D flying animated cards (exact match with table cards)
const sharedFlyingCardGeo = new THREE.BoxGeometry(1.15, 0.02, 1.75);

// Flying card animation descriptor (ultra-low computational overhead)
interface FlyingCard {
  id: string;
  type: 'play' | 'draw';
  mesh: THREE.Mesh;
  startPos: { x: number; y: number; z: number };
  endPos: { x: number; y: number; z: number };
  startRot: { x: number; y: number; z: number };
  endRot: { x: number; y: number; z: number };
  peakHeight: number;
  startTime: number;
  duration: number;
  started: boolean;
  onComplete?: () => void;
}

// Table & hand spatial anchors
const DISCARD_PILE_POS = { x: 0.85, y: 0.055, z: 0 };
const DRAW_PILE_POS = { x: -0.85, y: 0.22, z: 0 };
const LOCAL_HAND_POS = { x: 0, y: 0.45, z: 4.3 };
const LOCAL_HAND_ROT = { x: 0.35, y: 0, z: 0 };
const DRAW_PILE_ROT = { x: 0, y: 0, z: 0 };

function safeDisposeMaterial(mat: THREE.Material | THREE.Material[]) {
  if (Array.isArray(mat)) {
    mat.forEach(m => m.dispose());
  } else {
    mat.dispose();
  }
}

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
  isMobile: boolean = false,
  initialLook?: { targetYaw: number; targetPitch: number; currentYaw: number; currentPitch: number }
): HumanoidModelRig {
  const group = new THREE.Group();

  // ==========================================
  // 1. CASINO / GAMING CHAIR (Facing table)
  // In local coordinates: +Z is behind, -Z is facing table
  // ==========================================
  const chairGroup = new THREE.Group();

  // Seat Cushion (Contoured ergonomic seat positioned cleanly under the body without clipping into table)
  const seatGeo = new THREE.BoxGeometry(1.08, 0.16, 0.82);
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x161922,
    roughness: 0.5,
    metalness: 0.15,
  });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(0, 0.14, 0.24);
  if (!isMobile) seat.castShadow = true;
  seat.receiveShadow = true;
  chairGroup.add(seat);

  // Chair Heavy Metal Stem / Pedestal down to casino floor
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.84, 12), stemMat);
  stem.position.set(0, -0.85, 0.24);
  chairGroup.add(stem);

  // Chair Pedestal Base on floor
  const chairBase = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.08, 24), stemMat);
  chairBase.position.set(0, -1.74, 0.24);
  chairGroup.add(chairBase);

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
  const torsoGeo = new THREE.CylinderGeometry(0.44, 0.52, 1.05, isMobile ? 16 : 24);
  const torso = new THREE.Mesh(torsoGeo, clothMat);
  torso.position.y = 0.78;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Shoulders (rounded bar)
  const shouldersGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.15, 14);
  shouldersGeo.rotateZ(Math.PI / 2);
  const shoulders = new THREE.Mesh(shouldersGeo, clothMat);
  shoulders.position.set(0, 1.28, 0.02);
  if (!isMobile) shoulders.castShadow = true;
  bodyGroup.add(shoulders);

  // Arms extending forward towards table
  const armGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.74, 14);
  armGeo.rotateX(-Math.PI / 3.7); // angled forward towards table edge

  const leftArm = new THREE.Mesh(armGeo, clothMat);
  leftArm.position.set(-0.50, 0.96, -0.20);
  if (!isMobile) leftArm.castShadow = true;
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, clothMat);
  rightArm.position.set(0.50, 0.96, -0.20);
  if (!isMobile) rightArm.castShadow = true;
  bodyGroup.add(rightArm);

  // Hands (skin tone) holding the cards
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d0b0, roughness: 0.5 });
  const handGeo = new THREE.SphereGeometry(0.12, 12, 12);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(-0.24, 0.62, -0.62);
  bodyGroup.add(leftHand);

  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.set(0.24, 0.62, -0.62);
  bodyGroup.add(rightHand);

  // 3D Fan of Cards held in hands (Upright, tilted naturally back towards player's chest)
  const fanGroup = new THREE.Group();
  fanGroup.position.set(0, 0.64, -0.62); // centered at player's hands
  rebuildCardFan(fanGroup, player.cardCount, cardBackMat, isMobile);
  bodyGroup.add(fanGroup);

  group.add(bodyGroup);

  // ==========================================
  // 3. HUMANOID HEAD & HEADSET (Pivots with player gaze)
  // Pivot placed at base of neck (y = 1.48)
  // ==========================================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.48, 0);

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

  // Face Display with Cute Big Eyes (Curved seamlessly along the front of the head)
  const cuteFaceTex = getCuteFaceTexture();
  // Curved front shell geometry matching the head's exact curvature
  const faceGeo = new THREE.SphereGeometry(
    0.444,
    32,
    16,
    Math.PI * 1.18,
    Math.PI * 0.64,
    Math.PI * 0.24,
    Math.PI * 0.52
  );
  faceGeo.scale(1, 1.15, 0.96);
  const faceMat = new THREE.MeshStandardMaterial({
    map: cuteFaceTex,
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    roughness: 0.5,
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
  // 4. TURN GLOW & FLOOR HALO (Positioned on casino rug under chair, toggled with isTurn)
  // ==========================================
  const haloGeo = new THREE.RingGeometry(0.72, 1.05, 32);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.set(0, -1.76, 0.24);
  halo.visible = isTurn;
  group.add(halo);

  // ==========================================
  // 5. FLOATING 2D INFO BADGE (Username & Status)
  // In Three.js, a Sprite always faces the camera directly
  // ==========================================
  const badgeTex = createBadgeTexture(player, isTurn);
  const spriteMat = new THREE.SpriteMaterial({ map: badgeTex });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, 3.0, 0);
  sprite.scale.set(2.4, 0.65, 1);
  group.add(sprite);

  const initYaw = initialLook?.currentYaw ?? 0;
  const initPitch = initialLook?.currentPitch ?? 0;
  headGroup.rotation.y = -initYaw * 0.85;
  headGroup.rotation.x = initPitch * 0.75;
  bodyGroup.rotation.y = -initYaw * 0.35;

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
    targetYaw: initialLook?.targetYaw ?? initYaw,
    targetPitch: initialLook?.targetPitch ?? initPitch,
    currentYaw: initYaw,
    currentPitch: initPitch,
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

  // Active flying 3D animated cards queue
  const flyingCardsRef = useRef<FlyingCard[]>([]);
  const prevGameStateRef = useRef<GameState | null>(null);
  const discardImpactScale = useRef<number>(1.0);

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

  // Bidirectional alias mapping: socket.id or userId -> primary userKey
  const socketIdToUserKey = useRef<Map<string, string>>(new Map());

  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const myPlayerIdRef = useRef(myPlayerId);
  myPlayerIdRef.current = myPlayerId;

  const resolveUserKey = (keyOrSocketId?: string): string => {
    if (!keyOrSocketId) return '';
    return socketIdToUserKey.current.get(keyOrSocketId) || keyOrSocketId;
  };

  // Helper to find an active opponent rig by any of their identifiers (userId, playerId, or aliases)
  const findOpponentRig = (playerId?: string, userId?: string): HumanoidModelRig | undefined => {
    if (!playerId && !userId) return undefined;

    // 1. Direct key lookups in activeRigsMap
    if (userId && activeRigsMap.current.has(userId)) {
      return activeRigsMap.current.get(userId);
    }
    if (playerId && activeRigsMap.current.has(playerId)) {
      return activeRigsMap.current.get(playerId);
    }

    // 2. Resolved alias lookups
    const resolvedUser = resolveUserKey(userId);
    if (resolvedUser && activeRigsMap.current.has(resolvedUser)) {
      return activeRigsMap.current.get(resolvedUser);
    }
    const resolvedPlayer = resolveUserKey(playerId);
    if (resolvedPlayer && activeRigsMap.current.has(resolvedPlayer)) {
      return activeRigsMap.current.get(resolvedPlayer);
    }

    // 3. Exhaustive search across all active rigs matching player identity
    for (const rig of activeRigsMap.current.values()) {
      if (userId && rig.player.userId === userId) {
        return rig;
      }
      if (playerId && rig.player.id === playerId) {
        return rig;
      }
    }

    return undefined;
  };

  // First-Person Seated Look-Around State
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const lastEmittedLook = useRef({ yaw: 0, pitch: 0, time: 0 });

  // Fixed seat position of current player at table South
  const CAMERA_EYE_POSITION = new THREE.Vector3(0, 1.95, 5.85);

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
    currentYaw.current = DEFAULT_YAW;
    currentPitch.current = DEFAULT_PITCH;
    updateCameraLook();
    emitLook(DEFAULT_YAW, DEFAULT_PITCH, true);
  };

  // Helper to emit look angles to server (anchored to user identity)
  const emitLook = (yaw: number, pitch: number, force = false) => {
    if (typeof yaw !== 'number' || typeof pitch !== 'number' || Number.isNaN(yaw) || Number.isNaN(pitch)) return;
    const now = performance.now();
    if (force || now - lastEmittedLook.current.time > 45) {
      const dy = Math.abs(yaw - lastEmittedLook.current.yaw);
      const dp = Math.abs(pitch - lastEmittedLook.current.pitch);
      if (force || dy > 0.008 || dp > 0.008) {
        lastEmittedLook.current = { yaw, pitch, time: now };
        socket.emit('player:look', { yaw, pitch, userId: myUserIdRef.current });
      }
    }
  };

  // Sync other players' look-around head movements
  useEffect(() => {
    const onPlayerLooked = (payload: { playerId: string; userId?: string; yaw: number; pitch: number }) => {
      if (
        !payload ||
        typeof payload.yaw !== 'number' ||
        typeof payload.pitch !== 'number' ||
        Number.isNaN(payload.yaw) ||
        Number.isNaN(payload.pitch)
      ) {
        return;
      }

      // Ignore our own look-around broadcast (strictly match current active socket ID to prevent self-loop)
      const currentSocketId = myPlayerIdRef.current || socket.id;
      if (currentSocketId && payload.playerId === currentSocketId) {
        return;
      }

      // Update persistent look angle so newly created rigs immediately spawn facing this angle
      const saveKeys = [
        payload.userId,
        payload.playerId,
        resolveUserKey(payload.userId),
        resolveUserKey(payload.playerId),
      ].filter(Boolean) as string[];

      saveKeys.forEach(key => {
        const existing = persistentLookAngles.current.get(key);
        if (existing) {
          existing.targetYaw = payload.yaw;
          existing.targetPitch = payload.pitch;
        } else {
          persistentLookAngles.current.set(key, {
            targetYaw: payload.yaw,
            targetPitch: payload.pitch,
            currentYaw: payload.yaw,
            currentPitch: payload.pitch,
          });
        }
      });

      // Update active humanoid rig head look target immediately
      const rig = findOpponentRig(payload.playerId, payload.userId);
      if (rig) {
        rig.targetYaw = payload.yaw;
        rig.targetPitch = payload.pitch;
      }
    };

    const onPlayerAllLooks = (looks: Record<string, { yaw: number; pitch: number; userId?: string }>) => {
      if (!looks) return;
      const currentSocketId = myPlayerIdRef.current || socket.id;

      Object.entries(looks).forEach(([key, look]) => {
        if (!look || typeof look.yaw !== 'number' || typeof look.pitch !== 'number' || Number.isNaN(look.yaw) || Number.isNaN(look.pitch)) {
          return;
        }
        const userId = look.userId || key;
        if (currentSocketId && (key === currentSocketId || userId === currentSocketId)) {
          return;
        }

        const saveKeys = [
          userId,
          key,
          look.userId,
          resolveUserKey(userId),
          resolveUserKey(key),
        ].filter(Boolean) as string[];

        saveKeys.forEach(k => {
          persistentLookAngles.current.set(k, {
            targetYaw: look.yaw,
            targetPitch: look.pitch,
            currentYaw: look.yaw,
            currentPitch: look.pitch,
          });
        });

        const rig = findOpponentRig(key, userId);
        if (rig) {
          rig.targetYaw = look.yaw;
          rig.targetPitch = look.pitch;
          rig.currentYaw = look.yaw;
          rig.currentPitch = look.pitch;
          if (rig.headGroup) {
            rig.headGroup.rotation.y = -look.yaw * 0.85;
            rig.headGroup.rotation.x = look.pitch * 0.75;
          }
          if (rig.bodyGroup) {
            rig.bodyGroup.rotation.y = -look.yaw * 0.35;
          }
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
  }, [myPlayerId, myUserId]);

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
    };

    const onMouseUp = () => {
      if (isDragging.current) {
        emitLook(currentYaw.current, currentPitch.current, true);
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
    };

    const onTouchEnd = () => {
      if (isDragging.current) {
        emitLook(currentYaw.current, currentPitch.current, true);
      }
      isDragging.current = false;
    };

    const onWindowBlur = () => {
      if (isDragging.current) {
        emitLook(currentYaw.current, currentPitch.current, true);
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
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('mouseleave', onWindowBlur);
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

      // Broadcast local look updates at smooth intervals based on actual camera gaze
      emitLook(currentYaw.current, currentPitch.current);

      // Smoothly animate opponents' head and body rotations to match where they are looking
      const seenRigs = new Set<HumanoidModelRig>();
      activeRigsMap.current.forEach(rig => {
        if (!rig || seenRigs.has(rig)) return;
        seenRigs.add(rig);

        rig.currentYaw += (rig.targetYaw - rig.currentYaw) * 0.14;
        rig.currentPitch += (rig.targetPitch - rig.currentPitch) * 0.14;

        if (rig.headGroup) {
          // -currentYaw rotates head left/right in model coordinates
          rig.headGroup.rotation.y = -rig.currentYaw * 0.85;
          // currentPitch tilts head up/down
          rig.headGroup.rotation.x = rig.currentPitch * 0.75;
        }
        if (rig.bodyGroup) {
          // Torso follows head subtly
          rig.bodyGroup.rotation.y = -rig.currentYaw * 0.35;
        }
      });

      // Breathing animation on table light
      if (sceneRef.current) {
        const time = clock.getElapsedTime();
        tablePointLight.intensity = 0.5 + Math.sin(time * 2) * 0.15;
      }

      // Update in-flight 3D card animations with zero allocation
      const nowMs = performance.now();
      for (let i = flyingCardsRef.current.length - 1; i >= 0; i--) {
        const fc = flyingCardsRef.current[i];
        if (nowMs < fc.startTime) {
          continue;
        }
        if (!fc.started) {
          fc.started = true;
          fc.mesh.visible = true;
        }
        const elapsed = nowMs - fc.startTime;
        const progress = Math.min(1, elapsed / fc.duration);
        // Smooth cubic ease-out
        const easeT = 1 - Math.pow(1 - progress, 3);

        const inv = 1 - easeT;
        const c0 = inv * inv;
        const c1 = 2 * inv * easeT;
        const c2 = easeT * easeT;

        const midX = (fc.startPos.x + fc.endPos.x) * 0.5;
        const midY = Math.max(fc.startPos.y, fc.endPos.y) + fc.peakHeight;
        const midZ = (fc.startPos.z + fc.endPos.z) * 0.5;

        fc.mesh.position.x = c0 * fc.startPos.x + c1 * midX + c2 * fc.endPos.x;
        fc.mesh.position.y = c0 * fc.startPos.y + c1 * midY + c2 * fc.endPos.y;
        fc.mesh.position.z = c0 * fc.startPos.z + c1 * midZ + c2 * fc.endPos.z;

        fc.mesh.rotation.x = fc.startRot.x + (fc.endRot.x - fc.startRot.x) * easeT;
        fc.mesh.rotation.y = fc.startRot.y + (fc.endRot.y - fc.startRot.y) * easeT;
        fc.mesh.rotation.z = fc.startRot.z + (fc.endRot.z - fc.startRot.z) * easeT;

        if (progress >= 1) {
          if (fc.onComplete) fc.onComplete();
          scene.remove(fc.mesh);
          safeDisposeMaterial(fc.mesh.material);
          flyingCardsRef.current.splice(i, 1);
        }
      }

      // Smooth discard pile impact bounce decay
      if (discardImpactScale.current > 1.0) {
        discardImpactScale.current = Math.max(1.0, discardImpactScale.current - 0.02);
        if (discardCardMeshRef.current) {
          discardCardMeshRef.current.scale.set(
            discardImpactScale.current,
            discardImpactScale.current,
            discardImpactScale.current
          );
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      setSceneReady(false);
      activeRigsMap.current.clear();
      // Clean up in-flight card animations
      flyingCardsRef.current.forEach(fc => {
        scene.remove(fc.mesh);
        safeDisposeMaterial(fc.mesh.material);
      });
      flyingCardsRef.current = [];
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
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('mouseleave', onWindowBlur);
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

  // Coordinate 3D Flying Card Animations on card play and card draw
  useEffect(() => {
    if (!sceneReady || !gameState) return;

    const prev = prevGameStateRef.current;
    prevGameStateRef.current = gameState;

    // Initial load, rematch reset, or non-active match: sync top card immediately without animation
    if (!prev || prev.status !== 'playing' || gameState.status !== 'playing') {
      if (discardCardMeshRef.current && gameState.topCard) {
        const tex = createCardTexture(gameState.topCard);
        (discardCardMeshRef.current.material as THREE.MeshStandardMaterial).map = tex;
        (discardCardMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
      }
      if (gameState.status !== 'playing') {
        // Clean up any remaining flying cards
        flyingCardsRef.current.forEach(fc => {
          if (sceneRef.current) sceneRef.current.remove(fc.mesh);
          safeDisposeMaterial(fc.mesh.material);
        });
        flyingCardsRef.current = [];
      }
      return;
    }

    const scene = sceneRef.current;
    if (!scene) return;

    const isMobile = typeof navigator !== 'undefined' && (/mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent) || window.innerWidth < 768);
    const cardBackTex = createCardTexture(null, true);

    const spawnCard = (options: {
      type: 'play' | 'draw';
      texture: THREE.CanvasTexture;
      startPos: { x: number; y: number; z: number };
      endPos: { x: number; y: number; z: number };
      startRot: { x: number; y: number; z: number };
      endRot: { x: number; y: number; z: number };
      peakHeight: number;
      duration?: number;
      delay?: number;
      onComplete?: () => void;
    }) => {
      const delay = options.delay || 0;
      const duration = options.duration || 450;
      const mat = new THREE.MeshStandardMaterial({
        map: options.texture,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(sharedFlyingCardGeo, mat);
      mesh.castShadow = !isMobile;
      mesh.receiveShadow = false;
      mesh.position.set(options.startPos.x, options.startPos.y, options.startPos.z);
      mesh.rotation.set(options.startRot.x, options.startRot.y, options.startRot.z);
      mesh.visible = delay === 0;

      scene.add(mesh);

      flyingCardsRef.current.push({
        id: Math.random().toString(36).substring(2, 9),
        type: options.type,
        mesh,
        startPos: options.startPos,
        endPos: options.endPos,
        startRot: options.startRot,
        endRot: options.endRot,
        peakHeight: options.peakHeight,
        startTime: performance.now() + delay,
        duration,
        started: delay === 0,
        onComplete: options.onComplete,
      });
    };

    // 1. CARD PLAY ANIMATION
    const cardPlayed = prev.topCard && gameState.topCard && prev.topCard.id !== gameState.topCard.id;
    let drawStartDelay = 0;

    if (cardPlayed) {
      const playedById = gameState.lastPlayedBy || prev.currentTurnPlayerId;
      const isMe = (myPlayerId && playedById === myPlayerId) || (myUserId && playedById === myUserId);

      let startPos = { ...LOCAL_HAND_POS };
      let startRot = { ...LOCAL_HAND_ROT };

      if (!isMe) {
        const rig = findOpponentRig(playedById);

        if (rig && rig.fanGroup) {
          const worldPos = new THREE.Vector3();
          rig.fanGroup.getWorldPosition(worldPos);
          startPos = { x: worldPos.x, y: worldPos.y + 0.15, z: worldPos.z };
          startRot = { x: 0.2, y: rig.group.rotation.y, z: 0 };
        } else {
          // Fallback based on player index around table
          const pIndex = gameState.players.findIndex(p => p.id === playedById);
          if (pIndex !== -1) {
            const angle = (pIndex / gameState.players.length) * Math.PI * 2 + Math.PI / 2;
            startPos = { x: Math.cos(angle) * 4.8, y: 0.65, z: Math.sin(angle) * 4.8 };
            startRot = { x: 0.2, y: -angle - Math.PI / 2, z: 0 };
          }
        }
      }

      const targetRotY = -Math.PI / 12 + (Math.random() - 0.5) * 0.18;
      const endPos = { ...DISCARD_PILE_POS };
      const endRot = { x: 0, y: targetRotY, z: 0 };
      const topTex = createCardTexture(gameState.topCard);

      // Snap & clean up any previous in-flight play animations
      for (let i = flyingCardsRef.current.length - 1; i >= 0; i--) {
        if (flyingCardsRef.current[i].type === 'play') {
          const fc = flyingCardsRef.current[i];
          if (fc.onComplete) fc.onComplete();
          scene.remove(fc.mesh);
          safeDisposeMaterial(fc.mesh.material);
          flyingCardsRef.current.splice(i, 1);
        }
      }

      spawnCard({
        type: 'play',
        texture: topTex,
        startPos,
        endPos,
        startRot,
        endRot,
        peakHeight: isMe ? 0.95 : 1.25,
        duration: 440,
        onComplete: () => {
          if (discardCardMeshRef.current) {
            (discardCardMeshRef.current.material as THREE.MeshStandardMaterial).map = topTex;
            (discardCardMeshRef.current.material as THREE.MeshStandardMaterial).needsUpdate = true;
            discardCardMeshRef.current.rotation.y = targetRotY;
            discardImpactScale.current = 1.12;
          }
          if (!isMe) {
            sounds.playCard();
          }
        },
      });

      // If cards are drawn as a result of this play (Draw 2 / Wild 4), delay draw slightly so card lands first
      drawStartDelay = 220;
    }

    // 2. CARD DRAW ANIMATION
    gameState.players.forEach(player => {
      const prevP = prev.players.find(p => p.id === player.id || (p.userId && p.userId === player.userId));
      if (!prevP) return;

      const diff = player.cardCount - prevP.cardCount;
      if (diff > 0) {
        const isMe = (myPlayerId && player.id === myPlayerId) || (myUserId && player.userId === myUserId);
        const countToAnimate = Math.min(diff, 6); // Up to 6 flying cards for stacked penalties

        let targetPos = { ...LOCAL_HAND_POS };
        let targetRot = { ...LOCAL_HAND_ROT };

        const rig = findOpponentRig(player.id, player.userId);

        if (!isMe && rig && rig.fanGroup) {
          const worldPos = new THREE.Vector3();
          rig.fanGroup.getWorldPosition(worldPos);
          targetPos = { x: worldPos.x, y: worldPos.y + 0.15, z: worldPos.z };
          targetRot = { x: 0.2, y: rig.group.rotation.y, z: 0 };
        }

        for (let c = 0; c < countToAnimate; c++) {
          const isLast = c === countToAnimate - 1;
          spawnCard({
            type: 'draw',
            texture: cardBackTex,
            startPos: { ...DRAW_PILE_POS, y: DRAW_PILE_POS.y + c * 0.01 },
            endPos: targetPos,
            startRot: { ...DRAW_PILE_ROT },
            endRot: targetRot,
            peakHeight: isMe ? 1.05 : 1.3,
            duration: 440,
            delay: drawStartDelay + c * 110,
            onComplete: () => {
              if (!isMe && sounds.playDraw) {
                sounds.playDraw();
              }
              if (isLast && !isMe && rig && cardBackMatRef.current) {
                rebuildCardFan(rig.fanGroup, player.cardCount, cardBackMatRef.current, isMobile);
                rig.cardCount = player.cardCount;
              }
            },
          });
        }
      }
    });

  }, [gameState, sceneReady, myPlayerId, myUserId]);

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
      return;
    }

    if (!cardBackMatRef.current) {
      const cardBackTex = createCardTexture(null, true);
      cardBackMatRef.current = new THREE.MeshStandardMaterial({ map: cardBackTex, roughness: 0.3 });
    }
    const cardBackMat = cardBackMatRef.current;

    // Order players cyclicly so myPlayer is centered at bottom angle (theta = PI / 2, South)
    const currentSocketId = myPlayerIdRef.current || socket.id;
    let myIndex = players.findIndex(p => currentSocketId && p.id === currentSocketId);
    if (myIndex === -1 && myUserIdRef.current) {
      myIndex = players.findIndex(p => p.userId === myUserIdRef.current);
    }
    const sortedPlayers = myIndex >= 0
      ? [...players.slice(myIndex), ...players.slice(0, myIndex)]
      : [...players];

    const radius = 5.85; // Table edge distance (comfortably seated outside table rim without clipping)
    const currentActiveKeys = new Set<string>();
    const isMobile = typeof navigator !== 'undefined' && (/mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent) || window.innerWidth < 768);

    sortedPlayers.forEach((player, i) => {
      // In First-Person POV, your own avatar (index 0) is NOT rendered in front of your own eyes
      const isMe = i === 0 || (currentSocketId && player.id === currentSocketId);
      if (isMe) return;

      const userKey = player.userId || player.id;
      currentActiveKeys.add(userKey);
      currentActiveKeys.add(player.id);
      if (player.userId) currentActiveKeys.add(player.userId);

      // Register active alias mapping
      socketIdToUserKey.current.set(player.id, userKey);
      if (player.userId) {
        socketIdToUserKey.current.set(player.userId, userKey);
      }

      const isTurn = player.id === gameState.currentTurnPlayerId;
      const angle = (i / numPlayers) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Look up existing rig reliably by socket ID, user ID, or aliases
      let existingRig = findOpponentRig(player.id, player.userId);

      if (existingRig) {
        // Update stored reference to active socket ID & player state
        existingRig.player = player;
        activeRigsMap.current.set(userKey, existingRig);
        activeRigsMap.current.set(player.id, existingRig);
        if (player.userId) activeRigsMap.current.set(player.userId, existingRig);

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
          if (player.cardCount < existingRig.cardCount) {
            // Card was played: remove from fan immediately as it flies to table
            rebuildCardFan(existingRig.fanGroup, player.cardCount, cardBackMat, isMobile);
            existingRig.cardCount = player.cardCount;
          } else if (!prevGameStateRef.current || prevGameStateRef.current.status !== 'playing') {
            // Initial load or idle match: update fan immediately
            rebuildCardFan(existingRig.fanGroup, player.cardCount, cardBackMat, isMobile);
            existingRig.cardCount = player.cardCount;
          }
        }

        // Update turn glow halo, LED status rings, and badge texture
        if (existingRig.isTurn !== isTurn) {
          existingRig.isTurn = isTurn;
          existingRig.halo.visible = isTurn;
          (existingRig.leftRing.material as THREE.MeshBasicMaterial).color.setHex(isTurn ? 0x38bdf8 : 0x0284c7);
          (existingRig.rightRing.material as THREE.MeshBasicMaterial).color.setHex(isTurn ? 0x38bdf8 : 0x0284c7);
          if (existingRig.sprite.material.map) {
            existingRig.sprite.material.map.dispose();
          }
          existingRig.sprite.material.map = createBadgeTexture(player, isTurn);
          existingRig.sprite.material.needsUpdate = true;
        }
      } else {
        // New player rig: construct model with known persistent look angle
        const savedLook = persistentLookAngles.current.get(userKey) ||
          (player.userId ? persistentLookAngles.current.get(player.userId) : undefined) ||
          persistentLookAngles.current.get(player.id) || {
            targetYaw: 0,
            targetPitch: 0,
            currentYaw: 0,
            currentPitch: 0,
          };

        const rig = createHumanoidPlayerModel(player, isTurn, i, cardBackMat, isMobile, savedLook);
        rig.group.position.set(x, 0.0, z);
        rig.group.lookAt(0, 0.0, 0);
        rig.group.rotateY(Math.PI);

        playersGroup.add(rig.group);
        activeRigsMap.current.set(userKey, rig);
        activeRigsMap.current.set(player.id, rig);
        if (player.userId) activeRigsMap.current.set(player.userId, rig);
      }
    });

    // Remove any disconnected players who left the room
    activeRigsMap.current.forEach((rig, key) => {
      const isStillActive = currentActiveKeys.has(key) ||
        currentActiveKeys.has(rig.player.id) ||
        (rig.player.userId && currentActiveKeys.has(rig.player.userId));
      if (!isStillActive) {
        playersGroup.remove(rig.group);
        activeRigsMap.current.delete(key);
        if (rig.player.userId) {
          activeRigsMap.current.delete(rig.player.userId);
          persistentLookAngles.current.delete(rig.player.userId);
          socketIdToUserKey.current.delete(rig.player.userId);
        }
        activeRigsMap.current.delete(rig.player.id);
        persistentLookAngles.current.delete(rig.player.id);
        socketIdToUserKey.current.delete(rig.player.id);
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
