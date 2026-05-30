import { createNavigationUrls, type Coordinates, type NavigationProvider } from "./map";
import { getMapProviderHealth } from "./providers";

export type MapProviderMarker = Coordinates & {
  id: string;
  name: string;
  type: string;
};

export type MapProviderResult =
  | {
      attribution: string;
      kind: "mock" | "static";
      markers: MapProviderMarker[];
      ok: true;
      referenceNotice: string;
    }
  | { error: string; kind: "none"; ok: false; referenceNotice: string };

export interface MapProvider {
  buildPlaceMap(markers: MapProviderMarker[]): MapProviderResult;
  createNavigationUrl(
    place: { address?: string | null; latitude?: number | null; longitude?: number | null; name: string },
    provider: NavigationProvider,
  ): string;
  name: string;
}

export const EXTERNAL_DATA_REFERENCE_NOTICE = "外部数据仅供参考，请人工核验。";

export function createMapProvider(
  env: Record<string, string | undefined> = process.env,
): MapProvider {
  const health = getMapProviderHealth(env);

  if (health.kind === "mock") {
    return new StaticMapProvider("mock-map", "Mock map provider");
  }

  if (health.configured) {
    return new StaticMapProvider("static-map", "Static map with external navigation links");
  }

  return new UnconfiguredMapProvider();
}

class StaticMapProvider implements MapProvider {
  constructor(
    public readonly name: string,
    private readonly attribution: string,
  ) {}

  buildPlaceMap(markers: MapProviderMarker[]): MapProviderResult {
    return {
      attribution: this.attribution,
      kind: this.name === "mock-map" ? "mock" : "static",
      markers,
      ok: true,
      referenceNotice: EXTERNAL_DATA_REFERENCE_NOTICE,
    };
  }

  createNavigationUrl(
    place: { address?: string | null; latitude?: number | null; longitude?: number | null; name: string },
    provider: NavigationProvider,
  ): string {
    return createNavigationUrls(place)[provider];
  }
}

class UnconfiguredMapProvider implements MapProvider {
  name = "none";

  buildPlaceMap(): MapProviderResult {
    return {
      error: "地图 provider 未配置，已显示本地点位草图和外部导航链接。",
      kind: "none",
      ok: false,
      referenceNotice: EXTERNAL_DATA_REFERENCE_NOTICE,
    };
  }

  createNavigationUrl(
    place: { address?: string | null; latitude?: number | null; longitude?: number | null; name: string },
    provider: NavigationProvider,
  ): string {
    return createNavigationUrls(place)[provider];
  }
}
