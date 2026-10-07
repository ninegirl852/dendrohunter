"use client";

import nipplejs from "nipplejs";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { spawnInPark, type ParkRecord } from "@/lib/parks";

type ParkSceneProps = {
  park: ParkRecord;
  playerLat: number;
  playerLng: number;
  mockGps: boolean;
  running: boolean;
  onVirtualPosition: (lat: number, lng: number) => void;
  onTreeInfo: (tree: { chinese: string; scientific: string } | null) => void;
  onError: () => void;
};

const WALK_SPEED = 0.15;

export function ParkScene({
  park,
  playerLat,
  playerLng,
  mockGps,
  running,
  onVirtualPosition,
  onTreeInfo,
  onError,
}: ParkSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(running);
  const callbacks = useRef({ onVirtualPosition, onTreeInfo, onError });

  useEffect(() => {
    callbacks.current = { onVirtualPosition, onTreeInfo, onError };
    runningRef.current = running;
  }, [onVirtualPosition, onTreeInfo, onError, running]);

  useEffect(() => {
    const container = containerRef.current;
    const joystickZone = joystickRef.current;
    if (!container || !joystickZone) return;

    let frame = 0;
    let tipTimer = 0;
    let joystick: ReturnType<typeof nipplejs.create> | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    const move = { forward: 0, right: 0 };
    const keys = { forward: 0, right: 0 };
    const held = new Set<string>();

    const spawn = spawnInPark(park, playerLat, playerLng, mockGps);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 10, 150);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.rotation.order = "YXZ";
    camera.position.set(spawn.x, 1.7, spawn.z);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const lookDirection = new THREE.Vector3();
    const strafe = new THREE.Vector3();

    const resize = () => {
      if (!renderer) return;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const publishPosition = () => {
      callbacks.current.onVirtualPosition(
        park.lat - camera.position.z / spawn.latScale,
        park.lng + camera.position.x / spawn.lngScale,
      );
    };

    const showTree = (chinese: string | null, scientific = "") => {
      window.clearTimeout(tipTimer);
      callbacks.current.onTreeInfo(chinese ? { chinese, scientific } : null);
      if (chinese) {
        tipTimer = window.setTimeout(() => callbacks.current.onTreeInfo(null), 3000);
      }
    };

    const pickTree = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        const data = hit.object.userData as { chinese?: string; scientific?: string };
        if (data.chinese) {
          showTree(data.chinese, data.scientific ?? "");
          return;
        }
      }
      showTree(null);
    };

    const syncKeys = () => {
      const forward =
        (held.has("w") || held.has("arrowup") ? 1 : 0) -
        (held.has("s") || held.has("arrowdown") ? 1 : 0);
      const right =
        (held.has("d") || held.has("arrowright") ? 1 : 0) -
        (held.has("a") || held.has("arrowleft") ? 1 : 0);
      keys.forward = forward;
      keys.right = right;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!runningRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        return;
      }
      held.add(key);
      syncKeys();
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.key.toLowerCase());
      syncKeys();
    };

    let dragging = false;
    let previous = { x: 0, y: 0 };
    let start = { x: 0, y: 0, t: 0 };
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".joystick-zone")) return;
      dragging = true;
      previous = { x: event.clientX, y: event.clientY };
      start = { x: event.clientX, y: event.clientY, t: Date.now() };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !runningRef.current) return;
      camera.rotation.y -= (event.clientX - previous.x) * 0.005;
      camera.rotation.x -= (event.clientY - previous.y) * 0.005;
      camera.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, camera.rotation.x));
      previous = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved < 15 && Date.now() - start.t < 350) pickTree(event.clientX, event.clientY);
    };

    const loop = () => {
      frame = window.requestAnimationFrame(loop);
      if (!runningRef.current || !renderer || container.clientWidth === 0) return;
      camera.getWorldDirection(lookDirection);
      lookDirection.y = 0;
      if (lookDirection.lengthSq() > 0) lookDirection.normalize();
      strafe.crossVectors(camera.up, lookDirection);
      if (strafe.lengthSq() > 0) strafe.normalize();
      const forward = Math.max(-1, Math.min(1, move.forward + keys.forward));
      const right = Math.max(-1, Math.min(1, move.right + keys.right));
      if (forward !== 0 || right !== 0) {
        camera.position.addScaledVector(lookDirection, forward * WALK_SPEED);
        camera.position.addScaledVector(strafe, -right * WALK_SPEED);
        publishPosition();
      }
      renderer.render(scene, camera);
    };

    try {
      renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x87ceeb);
      container.appendChild(renderer.domElement);
      resize();

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const sun = new THREE.DirectionalLight(0xffffff, 0.8);
      sun.position.set(10, 20, 10);
      scene.add(sun);
      createMapFloor(scene, park.lat, park.lng);
      addTrees(scene, park, spawn.lngScale, spawn.latScale);

      joystick = nipplejs.create({
        zone: joystickZone,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "white",
      });
      joystick.on("move", (event) => {
        const data = event.data;
        move.forward = Math.sin(data.angle.radian) * Math.min(data.force, 1);
        move.right = Math.cos(data.angle.radian) * Math.min(data.force, 1);
      });
      joystick.on("end", () => {
        move.forward = 0;
        move.right = 0;
      });

      container.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      const observer = new ResizeObserver(() => {
        if (runningRef.current) resize();
      });
      observer.observe(container);
      publishPosition();
      loop();

      return () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(tipTimer);
        observer.disconnect();
        container.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        joystick?.destroy();
        renderer?.dispose();
        renderer?.forceContextLoss();
        container.replaceChildren();
      };
    } catch (error) {
      console.error("3D 渲染失敗:", error);
      callbacks.current.onError();
      return () => {
        window.cancelAnimationFrame(frame);
        joystick?.destroy();
        renderer?.dispose();
      };
    }
    // Player coordinates are read once, when this park is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [park]);

  return (
    <div className="scene-shell">
      <div ref={containerRef} className="scene-canvas" />
      <div ref={joystickRef} className="joystick-zone" aria-hidden="true" />
      <div className="crosshair" />
      <p className="walk-hint">拖曳轉向 · 搖桿或 WASD 步行 · 點一下樹木</p>
    </div>
  );
}

function createMapFloor(scene: THREE.Scene, centerLat: number, centerLng: number) {
  const zoom = 17;
  const resolution =
    (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / 2 ** zoom;
  const tileXExact = ((centerLng + 180) / 360) * 2 ** zoom;
  const tileYExact =
    ((1 -
      Math.log(
        Math.tan((centerLat * Math.PI) / 180) +
          1 / Math.cos((centerLat * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
    2 ** zoom;
  const tileX = Math.floor(tileXExact);
  const tileY = Math.floor(tileYExact);
  const offsetX = (tileXExact - tileX) * 256;
  const offsetY = (tileYExact - tileY) * 256;

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#4CAF50";
  context.fillRect(0, 0, 768, 768);

  const texture = new THREE.CanvasTexture(canvas);
  const floorSize = 768 * resolution;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshLambertMaterial({ map: texture, color: 0xdddddd }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(
    (384 - (256 + offsetX)) * resolution,
    0,
    (384 - (256 + offsetY)) * resolution,
  );
  scene.add(floor);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        context.drawImage(image, (dx + 1) * 256, (dy + 1) * 256, 256, 256);
        texture.needsUpdate = true;
      };
      image.src = `https://tile.openstreetmap.org/${zoom}/${tileX + dx}/${tileY + dy}.png`;
    }
  }
}

function addTrees(scene: THREE.Scene, park: ParkRecord, lngScale: number, latScale: number) {
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
  const leavesGeo = new THREE.ConeGeometry(1.5, 3.5, 8);
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });

  for (const tree of park.trees.slice(0, 300)) {
    if (!Number.isFinite(tree.lng) || !Number.isFinite(tree.lat)) continue;
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 3.5;
    const data = { chinese: tree.chinese, scientific: tree.scientific };
    trunk.userData = data;
    leaves.userData = data;
    group.add(trunk, leaves);
    group.position.set((tree.lng - park.lng) * lngScale, 0, -((tree.lat - park.lat) * latScale));
    scene.add(group);
  }
}
