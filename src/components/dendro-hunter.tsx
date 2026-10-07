"use client";

import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet";
import { ParkScene } from "@/components/park-scene";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  CHECKIN_REWARDS,
  checkIn,
  checkInPreview,
  cleanSpeciesName,
  collectSpecies,
  EMPTY_PLAYER,
  liveStreak,
  loadPlayer,
  localDateKey,
  savePlayer,
  STAGE_ICONS,
  STAGE_NAMES,
  TREE_DATA_URL,
  upgradeTree,
  type PlayerData,
} from "@/lib/game";
import { groupParks, spawnInPark, type ParkRecord } from "@/lib/parks";

type GpsStatus =
  | { kind: "pending" }
  | { kind: "mock" }
  | { kind: "searching" }
  | { kind: "ok"; lat: number; lng: number }
  | { kind: "error"; text: string };

type ScanNotice =
  | { kind: "text"; text: string }
  | { kind: "loading"; text: string }
  | { kind: "error"; title: string; detail: string };

type MapBundle = {
  map: LeafletMap;
  parksLayer: LayerGroup;
  treesLayer: LayerGroup;
  playerMarker: CircleMarker;
  virtualMarker: CircleMarker;
};

const HONG_KONG = { lat: 22.3193, lng: 114.1694 };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] ?? char;
  });
}

export default function DendroHunter() {
  const [player, setPlayer] = useState<PlayerData>(() => loadPlayer());
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadId, setLoadId] = useState(0);
  const [parks, setParks] = useState<ParkRecord[]>([]);
  const [gps, setGps] = useState<GpsStatus>(() =>
    typeof navigator !== "undefined" && navigator.geolocation
      ? { kind: "searching" }
      : { kind: "error", text: "❌ 不支援 GPS 定位" },
  );
  const [playerPos, setPlayerPos] = useState(HONG_KONG);
  const [mockGps, setMockGps] = useState(false);
  const [selectedPark, setSelectedPark] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [inPark, setInPark] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [currentPark, setCurrentPark] = useState<ParkRecord | null>(null);
  const [treeTip, setTreeTip] = useState<{ chinese: string; scientific: string } | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealName, setRevealName] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [speciesInput, setSpeciesInput] = useState("");
  const [speciesError, setSpeciesError] = useState("");
  const [realScanOpen, setRealScanOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<ScanNotice>({
    kind: "text",
    text: "正在請求相機權限...",
  });
  const [zoom, setZoom] = useState({ available: false, min: 1, max: 5, step: 0.1, value: 1 });

  const mapNode = useRef<HTMLDivElement>(null);
  const mapBundle = useRef<MapBundle | null>(null);
  const playerRef = useRef(player);
  const posRef = useRef(playerPos);
  const mockRef = useRef(mockGps);
  const inParkRef = useRef(inPark);
  const view3dRef = useRef(view3d);
  const parkRef = useRef(currentPark);
  const virtualRef = useRef(HONG_KONG);
  const gpsLocked = useRef(false);
  const appliedLock = useRef(false);
  const watchId = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const videoTrack = useRef<MediaStreamTrack | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const movePlayer = useCallback((lat: number, lng: number) => {
    posRef.current = { lat, lng };
    setPlayerPos({ lat, lng });
    mapBundle.current?.playerMarker.setLatLng([lat, lng]);
  }, []);

  useEffect(() => {
    playerRef.current = player;
    posRef.current = playerPos;
    mockRef.current = mockGps;
    inParkRef.current = inPark;
    view3dRef.current = view3d;
    parkRef.current = currentPark;
    savePlayer(player);
  }, [player, playerPos, mockGps, inPark, view3d, currentPark]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(TREE_DATA_URL);
        if (!response.ok) throw new Error("無法載入檔案");
        const grouped = groupParks(await response.json());
        if (!grouped.length) throw new Error("empty");
        if (cancelled) return;
        setParks(grouped);
        setPhase("ready");
        showToast("載入完成，點擊地圖上的公園標記進入");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadId, showToast]);

  const paintTrees = useCallback((park: ParkRecord, data: PlayerData) => {
    const bundle = mapBundle.current;
    if (!bundle) return;
    bundle.treesLayer.clearLayers();
    const collected = new Set(data.collectedSpecies);
    park.trees.forEach((tree) => {
      const known =
        collected.has(tree.chinese) || collected.has(cleanSpeciesName(tree.chinese));
      const circle = L.circleMarker([tree.lat, tree.lng], {
        radius: 6,
        color: "#fff",
        weight: 1.5,
        fillColor: known ? "#2ecc71" : "#bdc3c7",
        fillOpacity: 0.9,
      });
      circle.bindPopup(
        `<b>${escapeHtml(tree.chinese || "未知品種")}</b><br><small>${escapeHtml(tree.scientific)}</small>`,
      );
      circle.addTo(bundle.treesLayer);
    });
    bundle.virtualMarker.setLatLng([virtualRef.current.lat, virtualRef.current.lng]);
    bundle.virtualMarker.addTo(bundle.treesLayer);
  }, []);

  const enterPark = useCallback(
    (name: string) => {
      const bundle = mapBundle.current;
      const park = parks.find((item) => item.name === name);
      if (!bundle || !park) return;
      bundle.map.closePopup();
      const spawn = spawnInPark(park, posRef.current.lat, posRef.current.lng, mockRef.current);
      virtualRef.current = { lat: spawn.lat, lng: spawn.lng };
      paintTrees(park, playerRef.current);
      if (bundle.map.hasLayer(bundle.parksLayer)) bundle.map.removeLayer(bundle.parksLayer);
      if (!bundle.map.hasLayer(bundle.treesLayer)) bundle.map.addLayer(bundle.treesLayer);
      bundle.map.setView([park.lat, park.lng], 18);
      setCurrentPark(park);
      setInPark(true);
      setView3d(true);
      setTreeTip(null);
      setSettingsOpen(false);
      showToast(`已成功進入「${park.name}」`);
    },
    [paintTrees, parks, showToast],
  );

  const enterRef = useRef(enterPark);
  useEffect(() => {
    enterRef.current = enterPark;
  }, [enterPark]);

  useEffect(() => {
    if (phase !== "ready" || !mapNode.current || mapBundle.current || parks.length === 0) return;
    const map = L.map(mapNode.current, { zoomControl: true }).setView(
      [HONG_KONG.lat, HONG_KONG.lng],
      11,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    const parkIcon = L.icon({
      iconUrl: "/leaflet/marker-icon.png",
      iconRetinaUrl: "/leaflet/marker-icon-2x.png",
      shadowUrl: "/leaflet/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    const parksLayer = L.layerGroup().addTo(map);
    const treesLayer = L.layerGroup();
    parks.forEach((park) => {
      const marker = L.marker([park.lat, park.lng], { icon: parkIcon }).addTo(parksLayer);
      marker.bindPopup(
        `<div class="park-popup"><div class="park-popup-name">🌳 ${escapeHtml(park.name)}</div><div class="park-popup-count">包含 ${park.count} 棵樹木</div><button type="button" class="enter-park-btn" data-park="${encodeURIComponent(park.name)}">進入公園</button></div>`,
      );
    });

    const playerMarker = L.circleMarker([posRef.current.lat, posRef.current.lng], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: "#3498db",
      fillOpacity: 1,
    })
      .bindPopup("<b>📍 目前位置</b>")
      .addTo(map);
    const virtualMarker = L.circleMarker([HONG_KONG.lat, HONG_KONG.lng], {
      radius: 7,
      color: "#fff",
      weight: 2,
      fillColor: "#e74c3c",
      fillOpacity: 1,
    }).bindPopup("<b>🚶 你的虛擬位置</b>");

    map.on("popupopen", (event) => {
      const button = event.popup.getElement()?.querySelector<HTMLButtonElement>("[data-park]");
      button?.addEventListener(
        "click",
        () => {
          const encoded = button.dataset.park;
          if (encoded) enterRef.current(decodeURIComponent(encoded));
        },
        { once: true },
      );
    });

    mapBundle.current = { map, parksLayer, treesLayer, playerMarker, virtualMarker };
    window.setTimeout(() => map.invalidateSize(), 50);
    if (gpsLocked.current && !appliedLock.current && !inParkRef.current) {
      map.setView([posRef.current.lat, posRef.current.lng], 16);
      appliedLock.current = true;
    }

    return () => {
      map.remove();
      mapBundle.current = null;
    };
  }, [parks, phase]);

  useEffect(() => {
    if (mockGps || !navigator.geolocation) {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        if (mockRef.current) return;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        movePlayer(lat, lng);
        gpsLocked.current = true;
        setGps({ kind: "ok", lat, lng });
        const map = mapBundle.current?.map;
        if (!appliedLock.current && map && !inParkRef.current) {
          map.invalidateSize();
          map.setView([lat, lng], 16);
          appliedLock.current = true;
        }
      },
      (error) => {
        if (mockRef.current) return;
        if (error.code === 1) setGps({ kind: "error", text: "❌ 權限被拒絕" });
        else if (error.code === 2) setGps({ kind: "error", text: "❌ 無法獲取訊號" });
        else if (error.code === 3) setGps({ kind: "error", text: "❌ 連線超時" });
        else setGps({ kind: "error", text: `❌ ${error.message}` });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    );
    return () => {
      if (watchId.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [mockGps, movePlayer]);

  useEffect(() => {
    if (!inPark || view3d) return;
    const timer = window.setTimeout(() => {
      const bundle = mapBundle.current;
      if (!bundle) return;
      bundle.map.invalidateSize();
      bundle.map.setView([virtualRef.current.lat, virtualRef.current.lng], 19);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [inPark, view3d]);

  const leavePark = () => {
    const bundle = mapBundle.current;
    setInPark(false);
    setView3d(false);
    setCurrentPark(null);
    setTreeTip(null);
    if (bundle) {
      if (bundle.map.hasLayer(bundle.treesLayer)) bundle.map.removeLayer(bundle.treesLayer);
      if (!bundle.map.hasLayer(bundle.parksLayer)) bundle.map.addLayer(bundle.parksLayer);
      window.setTimeout(() => {
        bundle.map.invalidateSize();
        bundle.map.setView([posRef.current.lat, posRef.current.lng], 16);
      }, 100);
    }
    showToast("已離開公園");
  };

  const switchView = () => {
    setView3d((current) => !current);
    setTreeTip(null);
  };

  const locate = () => {
    const bundle = mapBundle.current;
    if (!bundle) return;
    bundle.map.invalidateSize();
    bundle.map.flyTo([posRef.current.lat, posRef.current.lng], 17);
    showToast("📍 已置中目前位置");
  };

  const collect = (rawName: string) => {
    const outcome = collectSpecies(playerRef.current, rawName);
    if (outcome.result.kind === "empty") {
      showToast("請輸入中文品種名稱");
      return false;
    }
    setPlayer(outcome.player);
    if (outcome.result.kind === "duplicate") {
      showToast(`獲得重複卡牌「${outcome.result.name}」，轉換為 1 袋肥料 🌱`);
      return true;
    }
    showToast("成功收集新樹木！獲得 2 袋肥料 🌱");
    setRevealName(outcome.result.name);
    setRevealOpen(true);
    if (inParkRef.current && !view3dRef.current && parkRef.current) {
      paintTrees(parkRef.current, outcome.player);
    }
    return true;
  };

  const onCheckIn = () => {
    const outcome = checkIn(player);
    if (outcome.already) {
      showToast("今日已經簽到過了！");
      return;
    }
    setPlayer(outcome.player);
    showToast(`簽到成功！連續 ${outcome.streak} 天，獲得 ${outcome.reward} 袋肥料 🌱`);
  };

  const onUpgrade = (species: string) => {
    const outcome = upgradeTree(player, species);
    if (!outcome.ok && outcome.reason === "max") {
      showToast("這棵樹已經長到最大囉！");
      return;
    }
    if (!outcome.ok) {
      showToast("❌ 肥料不足！請先簽到或掃描樹木。");
      return;
    }
    setPlayer(outcome.player);
    showToast(`✨ 升級成功！${species} 長大成為「${outcome.stage}」了！`);
  };

  const resetGame = () => {
    localStorage.removeItem("dendro_hunter_save");
    setPlayer({ ...EMPTY_PLAYER, collectedSpecies: [], treeLevels: {} });
    setSettingsOpen(false);
    setResetOpen(false);
    if (parkRef.current) paintTrees(parkRef.current, EMPTY_PLAYER);
    showToast("🗑️ 遊戲資料已完全重設");
  };

  const closeMenu = () => setMenuOpen(false);

  const openManual = () => {
    setSpeciesInput("");
    setSpeciesError("");
    setManualOpen(true);
  };

  const confirmManual = () => {
    if (!speciesInput.trim()) {
      setSpeciesError("請輸入中文品種名稱");
      return;
    }
    if (collect(speciesInput)) setManualOpen(false);
  };

  useEffect(() => {
    if (!realScanOpen) return;
    let cancelled = false;
    let scanner: { stop: () => Promise<void> } | null = null;
    videoTrack.current = null;

    const run = async () => {
      try {
        if (!window.isSecureContext) {
          setScanNotice({
            kind: "error",
            title: "❌ 瀏覽器安全限制",
            detail: "必須使用 HTTPS",
          });
          return;
        }
        let timedOut = false;
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((opened) => {
            if (cancelled || timedOut) opened.getTracks().forEach((track) => track.stop());
            return opened;
          }),
          new Promise<MediaStream>((_, reject) => {
            window.setTimeout(() => {
              timedOut = true;
              reject(new DOMException("相機啟動逾時", "TimeoutError"));
            }, 12000);
          }),
        ]);
        stream.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        setScanNotice({ kind: "text", text: "相機啟動中..." });
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !document.getElementById("reader")) return;
        const qr = new Html5Qrcode("reader");
        scanner = qr;
        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          async (decodedText) => {
            if (cancelled) return;
            await qr.stop().catch(() => undefined);
            scanner = null;
            setZoom((current) => ({ ...current, available: false }));
            if (decodedText.startsWith("http://") || decodedText.startsWith("https://")) {
              setScanNotice({ kind: "loading", text: "正在分析網址中的樹木資料..." });
              const name = await fetchTreeName(decodedText);
              if (cancelled) return;
              setRealScanOpen(false);
              if (name) collect(name);
              else {
                showToast("網站阻擋了自動讀取，請看著樹牌手動輸入");
                openManual();
              }
            } else {
              setRealScanOpen(false);
              collect(decodedText);
            }
          },
          () => undefined,
        );
        if (cancelled) {
          await qr.stop().catch(() => undefined);
          return;
        }
        setScanNotice({ kind: "text", text: "請將鏡頭對準樹上的 QR Code" });
        window.setTimeout(() => {
          const video = document.querySelector<HTMLVideoElement>("#reader video");
          const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
          const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & {
            zoom?: { min?: number; max?: number; step?: number };
          };
          if (!track || !capabilities?.zoom) return;
          videoTrack.current = track;
          const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
          setZoom({
            available: true,
            min: capabilities.zoom.min || 1,
            max: capabilities.zoom.max || 5,
            step: capabilities.zoom.step || 0.1,
            value: settings.zoom || 1,
          });
        }, 500);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        const message = error instanceof Error ? error.message : "未知錯誤";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setScanNotice({
            kind: "error",
            title: "❌ 您拒絕了相機權限",
            detail: "請在瀏覽器設定中重新允許。",
          });
        } else if (!window.isSecureContext) {
          setScanNotice({
            kind: "error",
            title: "❌ 瀏覽器安全限制",
            detail: "必須使用 HTTPS",
          });
        } else {
          setScanNotice({
            kind: "error",
            title: "❌ 找不到相機或發生錯誤",
            detail: message,
          });
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
      videoTrack.current = null;
      void scanner?.stop().catch(() => undefined);
    };
    // Scanner should start once per open, reading the latest collect/toast via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realScanOpen]);

  const applyZoom = async (value: number) => {
    setZoom((current) => ({ ...current, value }));
    try {
      await videoTrack.current?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
    } catch (error) {
      console.warn("無法應用縮放:", error);
    }
  };

  const checkedInToday = player.lastCheckinDate === localDateKey();
  const checkin = checkInPreview(player);
  const showMap = !(inPark && view3d);

  return (
    <main className="game-root">
      <div ref={mapNode} className="city-map" style={{ display: showMap ? "block" : "none" }} />

      {inPark && currentPark ? (
        <div className="scene-layer" style={{ display: view3d ? "block" : "none" }}>
          <ParkScene
            park={currentPark}
            playerLat={playerPos.lat}
            playerLng={playerPos.lng}
            mockGps={mockGps}
            running={view3d}
            onVirtualPosition={(lat, lng) => {
              virtualRef.current = { lat, lng };
              mapBundle.current?.virtualMarker.setLatLng([lat, lng]);
            }}
            onTreeInfo={setTreeTip}
            onError={() => {
              showToast("3D 場景載入失敗，已切換回 2D 模式");
              setView3d(false);
            }}
          />
          {treeTip ? (
            <div className="tree-info-panel">
              <h4>{treeTip.chinese || "未知品種"}</h4>
              <p>{treeTip.scientific}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="stats-panel">
        <div className="streak-pill">連續簽到：{liveStreak(player)} 天</div>
        <div className="fertilizer-pill">🌱 肥料：{player.fertilizer}</div>
        <div className="species-pill">📖 已收集：{player.collectedSpecies.length} 種</div>
      </div>

      {inPark ? null : (
        <Button
          type="button"
          className="settings-btn"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          ⚙️ 設定
        </Button>
      )}
      {inPark ? (
        <>
          <Button type="button" className="switch-view-btn" onClick={switchView}>
            {view3d ? "🗺️ 2D 樹木分佈" : "🚶‍♂️ 3D 虛擬漫遊"}
          </Button>
          <Button type="button" className="leave-park-btn" onClick={leavePark}>
            🚪 離開公園
          </Button>
        </>
      ) : null}

      <section className={`settings-panel ${settingsOpen && !inPark ? "show" : ""}`}>
        <h3>⚙️ 系統設定</h3>
        <div className="gps-box">
          <strong>📍 定位狀態：</strong>
          <GpsReadout status={gps} />
        </div>
        <Label className="mock-label">
          <Checkbox
            checked={mockGps}
            onCheckedChange={(checked) => {
              const enabled = checked === true;
              setMockGps(enabled);
              if (enabled) setGps({ kind: "mock" });
              else if (!navigator.geolocation) setGps({ kind: "error", text: "❌ 不支援 GPS 定位" });
              else setGps({ kind: "searching" });
            }}
          />
          啟用虛擬 GPS (開發模式)
        </Label>
        <div className="park-teleport">
          <Label htmlFor="park-select">傳送玩家至公園：</Label>
          <Select
            disabled={!mockGps}
            value={selectedPark}
            onValueChange={(value) => {
              const name = typeof value === "string" ? value : null;
              setSelectedPark(name);
              if (!name || !mockRef.current) return;
              const park = parks.find((item) => item.name === name);
              if (!park) return;
              movePlayer(park.lat, park.lng);
              mapBundle.current?.map.flyTo([park.lat, park.lng], 16);
            }}
          >
            <SelectTrigger id="park-select" className="park-select">
              <SelectValue placeholder="-- 請先開啟虛擬 GPS --" />
            </SelectTrigger>
            <SelectContent>
              {parks.map((park) => (
                <SelectItem key={park.name} value={park.name}>
                  {park.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Separator className="settings-rule" />
        <Button type="button" className="reset-btn" onClick={() => setResetOpen(true)}>
          🗑️ 重設遊戲資料
        </Button>
      </section>

      {showMap ? (
        <Button type="button" className="locate-btn" onClick={locate} aria-label="回到目前位置">
          🎯
        </Button>
      ) : null}

      {toast ? (
        <div className="toast-bar" role="status">
          {toast}
        </div>
      ) : null}

      <Button
        type="button"
        className="action-menu-btn"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? "❌ 關閉選單" : "🎒 行動選單"}
      </Button>
      <div className={`action-menu ${menuOpen ? "show" : ""}`}>
        <Button
          type="button"
          className={`checkin-btn ${checkedInToday ? "is-done" : ""}`}
          onClick={() => {
            closeMenu();
            setCheckinOpen(true);
          }}
        >
          {checkedInToday ? "今日已簽到" : "每日簽到"}
        </Button>
        <Button
          type="button"
          className="garden-btn"
          onClick={() => {
            closeMenu();
            setGardenOpen(true);
          }}
        >
          🏡 虛擬園圃
        </Button>
        <Button
          type="button"
          className="collection-btn"
          onClick={() => {
            closeMenu();
            setCollectionOpen(true);
          }}
        >
          📖 我的卡牌
        </Button>
        <Button
          type="button"
          className="real-scan-btn"
          onClick={() => {
            closeMenu();
            setZoom({ available: false, min: 1, max: 5, step: 0.1, value: 1 });
            setScanNotice({ kind: "text", text: "正在請求相機權限..." });
            setRealScanOpen(true);
          }}
        >
          真實掃描 QR
        </Button>
        <Button
          type="button"
          className="scan-btn"
          onClick={() => {
            closeMenu();
            openManual();
          }}
        >
          模擬掃描
        </Button>
      </div>

      {phase === "ready" ? null : (
        <div className="loading-overlay">
          {phase === "error" ? null : <div className="spinner" />}
          <p>{phase === "error" ? "載入失敗，請確認檔案路徑與檔名。" : "正在從本機載入樹木資料..."}</p>
          {phase === "error" ? (
            <Button
              type="button"
              className="retry-btn"
              onClick={() => {
                setPhase("loading");
                setLoadId((id) => id + 1);
              }}
            >
              重試
            </Button>
          ) : null}
        </div>
      )}

      <Dialog open={realScanOpen} onOpenChange={setRealScanOpen}>
        <DialogContent className="game-modal" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>掃描樹木 QR Code</DialogTitle>
            <DialogDescription className="sr-only">使用相機讀取樹上的 QR Code</DialogDescription>
          </DialogHeader>
          <div id="reader" className="qr-reader" />
          {zoom.available ? (
            <div className="zoom-box">
              <Label htmlFor="zoom-slider" className="zoom-label">
                🔍 鏡頭縮放
              </Label>
              <Slider
                id="zoom-slider"
                className="zoom-slider"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={[zoom.value]}
                onValueChange={(value) => {
                  const next = Array.isArray(value) ? value[0] : value;
                  if (typeof next === "number") void applyZoom(next);
                }}
              />
            </div>
          ) : null}
          <ScanMessage notice={scanNotice} />
          <DialogFooter className="modal-actions">
            <Button type="button" className="cancel-btn" onClick={() => setRealScanOpen(false)}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="game-modal" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>手動輸入樹木名稱</DialogTitle>
            <DialogDescription>請看著樹木標籤，輸入中文品種名稱</DialogDescription>
          </DialogHeader>
          <Input
            value={speciesInput}
            placeholder="例如：細葉榕、鳳凰木"
            autoComplete="off"
            aria-invalid={Boolean(speciesError)}
            onChange={(event) => {
              setSpeciesInput(event.target.value);
              if (speciesError) setSpeciesError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") confirmManual();
            }}
          />
          {speciesError ? <p className="field-error">{speciesError}</p> : null}
          <DialogFooter className="modal-actions">
            <Button type="button" className="cancel-btn" onClick={() => setManualOpen(false)}>
              取消
            </Button>
            <Button type="button" className="confirm-btn" onClick={confirmManual}>
              確認收集
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent className="game-modal" showCloseButton={false}>
          <DialogHeader className="center-copy">
            <DialogTitle className="collection-title">每日簽到</DialogTitle>
            <DialogDescription>
              連續簽到才會累積。缺一天就從第 1 天重來，第 7 天肥料最多。
            </DialogDescription>
          </DialogHeader>
          <p className="checkin-streak">
            連續簽到：{checkin.already ? checkin.streak : liveStreak(player)} 天
          </p>
          {checkin.broken ? (
            <p className="checkin-note">昨日未簽到，這次會從第 1 天重新計算。</p>
          ) : null}
          <div className="checkin-week" aria-label="七日簽到獎勵">
            {CHECKIN_REWARDS.map((reward, index) => {
              const claimed = checkin.already
                ? index <= checkin.dayIndex
                : index < checkin.dayIndex;
              const isToday = index === checkin.dayIndex;
              return (
                <div
                  key={index}
                  className={`checkin-day${claimed ? " done" : ""}${isToday ? " today" : ""}`}
                >
                  <span>第{index + 1}天</span>
                  <strong>{reward}🌱</strong>
                </div>
              );
            })}
          </div>
          <DialogFooter className="modal-actions">
            <Button type="button" className="cancel-btn" onClick={() => setCheckinOpen(false)}>
              關閉
            </Button>
            <Button
              type="button"
              className={`confirm-btn ${checkin.already ? "is-done" : ""}`}
              disabled={checkin.already}
              onClick={onCheckIn}
            >
              {checkin.already ? "今日已簽到" : `領取 ${checkin.reward} 袋肥料`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gardenOpen} onOpenChange={setGardenOpen}>
        <DialogContent className="game-modal garden-modal" showCloseButton={false}>
          <DialogHeader className="center-copy">
            <DialogTitle className="garden-title">🏡 我的虛擬園圃</DialogTitle>
            <DialogDescription>消耗肥料讓你的樹苗成長茁壯！</DialogDescription>
          </DialogHeader>
          <ScrollArea className="grid-scroll">
            {player.collectedSpecies.length === 0 ? (
              <p className="empty-copy empty-garden">尚未收集任何樹木，先去掃描吧！</p>
            ) : (
              <div className="garden-grid">
                {player.collectedSpecies.map((species) => {
                  const level = player.treeLevels[species] || 1;
                  const maxed = level >= 5;
                  return (
                    <article key={species} className="garden-card">
                      <span className="stage-icon">{STAGE_ICONS[level - 1]}</span>
                      <h4>{species}</h4>
                      <div className="level-text">
                        Lv.{level} : {STAGE_NAMES[level - 1]}
                      </div>
                      <Button
                        type="button"
                        className={`upgrade-btn ${maxed ? "max" : ""}`}
                        disabled={maxed}
                        onClick={() => onUpgrade(species)}
                      >
                        {maxed ? "已達最高級" : "升級 (消耗 1 🌱)"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="modal-actions">
            <Button type="button" className="cancel-btn" onClick={() => setGardenOpen(false)}>
              關閉園圃
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
        <DialogContent className="game-modal collection-modal" showCloseButton={false}>
          <DialogHeader className="center-copy">
            <DialogTitle className="collection-title">🌳 樹木卡牌圖鑑</DialogTitle>
            <DialogDescription>探索公園並掃描 QR Code 來解鎖更多樹木！</DialogDescription>
          </DialogHeader>
          <ScrollArea className="grid-scroll">
            {player.collectedSpecies.length === 0 ? (
              <p className="empty-copy empty-cards">尚未收集任何卡牌，快去掃描吧！</p>
            ) : (
              <div className="card-grid">
                {player.collectedSpecies.map((species) => (
                  <article key={species} className="tcg-card">
                    <span className="card-icon">🌳</span>
                    <span>{species}</span>
                  </article>
                ))}
                {Array.from({ length: 3 }, (_, index) => (
                  <article key={`locked-${index}`} className="tcg-card locked">
                    <span className="card-icon">❓</span>
                    <span>未解鎖</span>
                  </article>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="modal-actions">
            <Button type="button" className="cancel-btn" onClick={() => setCollectionOpen(false)}>
              關閉圖鑑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent className="reveal-modal" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="reveal-heading">解鎖新卡牌！</DialogTitle>
            <DialogDescription className="sr-only">新樹木已放入園圃</DialogDescription>
          </DialogHeader>
          <div className="reveal-card">
            <span className="reveal-icon">🌳</span>
            <span className="reveal-name">{revealName}</span>
            <span className="reveal-sub">★ 等級 1 幼苗 ★</span>
          </div>
          <DialogFooter className="modal-actions">
            <Button type="button" className="reveal-close" onClick={() => setRevealOpen(false)}>
              放入園圃
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重設遊戲資料</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ 警告：確定要刪除所有遊戲資料（包含收集的卡牌、肥料與園圃進度）嗎？此動作無法復原！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="reset-confirm" onClick={resetGame}>
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function GpsReadout({ status }: { status: GpsStatus }) {
  if (status.kind === "pending") return <span className="gps-muted">準備中...</span>;
  if (status.kind === "mock") return <span className="gps-mock">啟用虛擬 GPS</span>;
  if (status.kind === "searching") return <span className="gps-muted">搜尋衛星訊號中...</span>;
  if (status.kind === "ok") {
    return (
      <span className="gps-ok">
        🟢 成功
        <small>
          Lat: {status.lat.toFixed(4)}
          <br />
          Lng: {status.lng.toFixed(4)}
        </small>
      </span>
    );
  }
  return <span className="gps-bad">{status.text}</span>;
}

function ScanMessage({ notice }: { notice: ScanNotice }) {
  if (notice.kind === "error") {
    return (
      <p className="scan-message">
        <span className="gps-bad">{notice.title}</span>
        <br />
        {notice.detail}
      </p>
    );
  }
  if (notice.kind === "loading") {
    return (
      <p className="scan-message">
        {notice.text}
        <span className="spinner spinner-small" />
      </p>
    );
  }
  return <p className="scan-message">{notice.text}</p>;
}

async function fetchTreeName(url: string) {
  try {
    const response = await fetch(`/api/get-tree?url=${encodeURIComponent(url)}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { name?: string };
    if (!data.name || data.name === "未知樹木") return null;
    const cleanName = cleanSpeciesName(data.name.split(/[,，、/]/)[0] ?? "");
    return cleanName || null;
  } catch (error) {
    console.error("呼叫 API 失敗:", error);
    return null;
  }
}
