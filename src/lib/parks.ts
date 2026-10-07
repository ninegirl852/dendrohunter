export type TreePoint = {
  lat: number;
  lng: number;
  chinese: string;
  scientific: string;
};

export type ParkRecord = {
  name: string;
  count: number;
  lat: number;
  lng: number;
  trees: TreePoint[];
};

type FeatureCollection = {
  features?: Array<{
    geometry?: { type?: string; coordinates?: number[] } | null;
    properties?: {
      Location_in_Chinese?: string | null;
      Location_in_English?: string | null;
      Chinese_Name?: string | null;
      Scientific_Name?: string | null;
    } | null;
  }>;
};

export function groupParks(data: FeatureCollection): ParkRecord[] {
  const draft = new Map<
    string,
    { count: number; latSum: number; lngSum: number; trees: TreePoint[] }
  >();

  for (const feature of data.features ?? []) {
    const props = feature.properties ?? {};
    const name = props.Location_in_Chinese || props.Location_in_English;
    const coords = feature.geometry?.coordinates;
    if (!name || !coords || coords.length < 2) continue;
    const lng = coords[0];
    const lat = coords[1];
    if (typeof lng !== "number" || typeof lat !== "number") continue;

    const park = draft.get(name) ?? { count: 0, latSum: 0, lngSum: 0, trees: [] };
    park.count += 1;
    park.lngSum += lng;
    park.latSum += lat;
    park.trees.push({
      lat,
      lng,
      chinese: props.Chinese_Name?.trim() || "未知品種",
      scientific: props.Scientific_Name?.trim() || "",
    });
    draft.set(name, park);
  }

  return [...draft.entries()].map(([name, park]) => ({
    name,
    count: park.count,
    lat: park.latSum / park.count,
    lng: park.lngSum / park.count,
    trees: park.trees,
  }));
}

export function spawnInPark(
  park: { lat: number; lng: number },
  playerLat: number,
  playerLng: number,
  mockGps: boolean,
) {
  const latScale = 111000;
  const lngScale = 111000 * Math.cos((park.lat * Math.PI) / 180);
  let x = (playerLng - park.lng) * lngScale;
  let z = -(playerLat - park.lat) * latScale;
  if (Number.isNaN(x)) x = 0;
  if (Number.isNaN(z)) z = 0;
  const distance = Math.hypot(x, z);
  if (mockGps || distance > 500) {
    x = 0;
    z = 0;
  }
  return {
    x,
    z,
    latScale,
    lngScale,
    lat: park.lat - z / latScale,
    lng: park.lng + x / lngScale,
  };
}
