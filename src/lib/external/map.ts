import type { PlaceType } from "@prisma/client";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type MapPlace = Coordinates & {
  address?: string | null;
  id: string;
  name: string;
  type: PlaceType;
};

export type NavigationProvider = "apple" | "baidu" | "gaode" | "google";

export const PLACE_TYPE_MARKER_STYLES: Record<
  PlaceType,
  { className: string; label: string }
> = {
  ACTIVITY: { className: "bg-[#8a5fbf]", label: "A" },
  AIRPORT: { className: "bg-[#2f5c99]", label: "P" },
  ATTRACTION: { className: "bg-[#2f6f73]", label: "S" },
  EMBASSY: { className: "bg-[#6a5d52]", label: "E" },
  EMERGENCY: { className: "bg-[#b13b2f]", label: "!" },
  HOSPITAL: { className: "bg-[#c04762]", label: "H" },
  HOTEL: { className: "bg-[#7a5b1c]", label: "L" },
  OTHER: { className: "bg-[#66737b]", label: "O" },
  RESTAURANT: { className: "bg-[#c56a2c]", label: "F" },
  SHOPPING: { className: "bg-[#8c4f8f]", label: "B" },
  STATION: { className: "bg-[#415d7e]", label: "T" },
  STORE: { className: "bg-[#5f7a36]", label: "M" },
  TRANSPORT: { className: "bg-[#435f87]", label: "R" },
};

export function hasCoordinates<T extends {
  latitude: number | null;
  longitude: number | null;
}>(place: T,
): place is T & Coordinates {
  return isValidLatitude(place.latitude) && isValidLongitude(place.longitude);
}

export function isValidLatitude(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function normalizeCoordinateInput(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createNavigationUrls(place: {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  name: string;
}): Record<NavigationProvider, string> {
  const label = place.name.trim() || "Destination";
  const query = place.address?.trim() || label;
  const hasPoint = isValidLatitude(place.latitude) && isValidLongitude(place.longitude);
  const lat = hasPoint ? String(place.latitude) : "";
  const lng = hasPoint ? String(place.longitude) : "";

  return {
    apple: hasPoint
      ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`
      : `https://maps.apple.com/?q=${encodeURIComponent(query)}`,
    baidu: hasPoint
      ? `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${encodeURIComponent(label)}&content=${encodeURIComponent(query)}&output=html`
      : `https://map.baidu.com/search/${encodeURIComponent(query)}`,
    gaode: hasPoint
      ? `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(label)}`
      : `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}`,
    google: hasPoint
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  };
}

export function projectPlacesToMap(places: MapPlace[]): Array<
  MapPlace & {
    x: number;
    y: number;
  }
> {
  if (places.length === 0) {
    return [];
  }

  const latitudes = places.map((place) => place.latitude);
  const longitudes = places.map((place) => place.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;

  return places.map((place) => ({
    ...place,
    x: clampPercent(((place.longitude - minLng) / lngRange) * 84 + 8),
    y: clampPercent(92 - ((place.latitude - minLat) / latRange) * 84),
  }));
}

export function buildPolylinePoints(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function clampPercent(value: number): number {
  return Math.min(96, Math.max(4, Math.round(value * 100) / 100));
}
