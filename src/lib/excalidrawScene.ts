import { serializeAsJSON } from "@excalidraw/excalidraw";

export interface ExcalidrawSceneData {
  elements: readonly any[];
  appState?: any;
  files?: Record<string, any>;
}

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null;

const normalizeCollaborators = (value: unknown): Map<string, any> => {
  if (value instanceof Map) {
    return value;
  }

  if (Array.isArray(value)) {
    return new Map(
      value.filter(
        (entry): entry is [string, any] =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string",
      ),
    );
  }

  if (isRecord(value)) {
    return new Map(Object.entries(value));
  }

  return new Map();
};

const normalizeFollowedBy = (value: unknown): Set<string> => {
  if (value instanceof Set) {
    return value;
  }

  if (Array.isArray(value)) {
    return new Set(
      value.filter((entry): entry is string => typeof entry === "string"),
    );
  }

  if (isRecord(value)) {
    return new Set(
      Object.entries(value)
        .filter(([, isFollowing]) => Boolean(isFollowing))
        .map(([socketId]) => socketId),
    );
  }

  return new Set();
};

const normalizeAppState = (appState: unknown) => {
  const normalizedAppState = isRecord(appState) ? { ...appState } : {};

  // Excalidraw expects collaborators to be a Map and followedBy to be a Set.
  normalizedAppState.collaborators = normalizeCollaborators(
    normalizedAppState.collaborators,
  );
  normalizedAppState.followedBy = normalizeFollowedBy(
    normalizedAppState.followedBy,
  );

  return normalizedAppState;
};

export function normalizeSceneData(data: any): ExcalidrawSceneData {
  return {
    elements: Array.isArray(data?.elements) ? data.elements : [],
    appState: normalizeAppState(data?.appState),
    files: isRecord(data?.files) ? data.files : {},
  };
}

export function createSceneSnapshot(scene: ExcalidrawSceneData): string {
  return serializeAsJSON(
    scene.elements ?? [],
    scene.appState ?? {},
    scene.files ?? {},
    "database",
  );
}
