// vite-project/src/components/ExcalidrawWrapper.tsx
import React, { useEffect, useState, useCallback } from 'react';
import debounce from 'lodash.debounce'; // Import debounce
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"; // Import Excalidraw CSS
// Removed CSS import as it's linked in index.html
import { useTranslation } from 'react-i18next';
import { saveCachedFile, deleteCachedFile, CachedFileData } from '../lib/db';
import { createSceneSnapshot, ExcalidrawSceneData, normalizeSceneData } from '../lib/excalidrawScene';

const MISSING_BASELINE_PREFIX = '__missing_remote_baseline__:';

// Define props using inline types or any for now
interface ExcalidrawWrapperProps {
  initialData: ExcalidrawSceneData | null;
  // Update onChange prop type to include isModified
  onChange?: (elements: readonly any[], appState: any, files: any, isModified: boolean) => void;
  // 添加缓存相关的props
  filePath?: string;
  repoFullName?: string;
  branch?: string;
  originalSha?: string;
  baselineSnapshot?: string | null;
}

// Define ref type using any for now
export interface ExcalidrawWrapperRef {
  getSceneElements: () => readonly any[];
  getAppState: () => any;
  getFiles: () => Record<string, any>;
}

export const ExcalidrawWrapper = React.forwardRef<ExcalidrawWrapperRef, ExcalidrawWrapperProps>(
  ({ initialData, onChange, filePath, repoFullName, branch, originalSha, baselineSnapshot }, ref) => {
    const { i18n } = useTranslation();
    // Use any for the API state type
    const [excalidrawAPI, setExcalidrawAPI] = useState<any | null>(null);
    const lastModifiedRef = React.useRef<boolean | null>(null);

    // Callback ref to get the API instance
    const excalidrawRefCallback = useCallback((api: any | null) => { // Use any for api type
        if (api) {
            setExcalidrawAPI(api);
            console.log('[DEBUG] Excalidraw API object:', api); // Log API object
        }
    }, []);

    React.useImperativeHandle(ref, () => ({
      getSceneElements: () => {
        return excalidrawAPI?.getSceneElements() || [];
      },
      getAppState: () => {
        return excalidrawAPI?.getAppState() || {}; // Return empty object as default
      },
      getFiles: () => {
        return excalidrawAPI?.getFiles?.() || {};
      }
    }));

    console.log("Rendering ExcalidrawWrapper with initialData:", initialData);

    // Push loaded scene into the editor whenever the opened file changes.
    useEffect(() => {
        if (excalidrawAPI && initialData?.elements) {
            console.log("[DEBUG] ExcalidrawWrapper: Updating scene with initialData.");
            const sceneData = {
                elements: initialData.elements,
                appState: initialData.appState ?? {},
                files: initialData.files
            };
            excalidrawAPI.updateScene(sceneData);
        }
    }, [initialData, excalidrawAPI]); // Keep dependencies

    useEffect(() => {
        lastModifiedRef.current = null;
    }, [filePath, baselineSnapshot]);

    // 仅对 dirty 文件持久化 draft；恢复为 baseline 时删除缓存。
    const debouncedSyncCache = useCallback(
        debounce(async (scene: ExcalidrawSceneData, isModified: boolean, baseSnapshot?: string | null) => {
            if (!filePath || !repoFullName || !branch) {
                console.log('[DEBUG] ExcalidrawWrapper: Skipping cache sync, missing file info');
                return;
            }

            try {
                if (!isModified) {
                    await deleteCachedFile(repoFullName, branch, filePath);
                    console.log(`[DEBUG] ExcalidrawWrapper: Removed draft cache for clean file: ${filePath}`);
                    return;
                }

                const cacheData: CachedFileData = {
                    filePath,
                    repoFullName,
                    branch,
                    content: normalizeSceneData(scene),
                    lastModified: Date.now(),
                    baseSnapshot: baseSnapshot?.startsWith(MISSING_BASELINE_PREFIX) ? undefined : (baseSnapshot ?? undefined),
                    originalSha
                };
                
                await saveCachedFile(cacheData);
                console.log(`[DEBUG] ExcalidrawWrapper: Saved dirty draft to cache: ${filePath}`);
            } catch (error) {
                console.error('[DEBUG] ExcalidrawWrapper: Failed to sync cache:', error);
            }
        }, 1000), // 1秒防抖
        [filePath, repoFullName, branch, originalSha]
    );

    useEffect(() => {
        debouncedSyncCache.cancel();
    }, [baselineSnapshot, debouncedSyncCache]);

    // Raw onChange handler from Excalidraw
    const handleRawExcalidrawChange = (elements: readonly any[], appState: any, files: any) => {
        const scene = normalizeSceneData({ elements, appState, files });
        const currentSnapshot = createSceneSnapshot(scene);
        const isModified = baselineSnapshot == null ? false : currentSnapshot !== baselineSnapshot;

        // Persist locally on every edit (debounced) so file switch won't lose pending changes.
        debouncedSyncCache(scene, isModified, baselineSnapshot);

        if (lastModifiedRef.current !== isModified) {
            console.log(`[DEBUG] ExcalidrawWrapper: isModified changed for ${filePath}: ${isModified}`);
            lastModifiedRef.current = isModified;
            if (onChange) {
                onChange(elements, appState, files, isModified);
            }
        }
    };

    // Flush pending cache writes on file switch/unmount to keep unsaved content recoverable.
    useEffect(() => {
        return () => {
            debouncedSyncCache.flush();
            debouncedSyncCache.cancel();
        };
    }, [debouncedSyncCache]);

    // Log the props being passed down to the actual Excalidraw component
    console.log('[DEBUG] Props passed to Excalidraw component:', { initialData, onChange: handleRawExcalidrawChange, langCode: i18n.language.startsWith('zh') ? 'zh-CN' : 'en' });
    return (
      <div style={{ height: "100%", width: "100%" }}>
        <Excalidraw
          // Use the excalidrawAPI prop to get the API instance
          excalidrawAPI={excalidrawRefCallback}
          initialData={initialData}
          onChange={handleRawExcalidrawChange} // Use the raw handler
          langCode={i18n.language.startsWith('zh') ? 'zh-CN' : 'en'}
        />
      </div>
    );
  }
);

ExcalidrawWrapper.displayName = "ExcalidrawWrapper";
