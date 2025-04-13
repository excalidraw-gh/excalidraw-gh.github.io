// vite-project/src/components/ExcalidrawWrapper.tsx
import React, { useEffect, useState, useCallback } from 'react'; // Import useState, useCallback
// Removed explicit type imports that were causing errors
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css"; // Import Excalidraw CSS
// Removed CSS import as it's linked in index.html
import { useTranslation } from 'react-i18next';

// Define props using inline types or any for now
interface ExcalidrawWrapperProps {
  initialData: {
    elements: readonly any[]; // Use any for elements for now
    appState?: any | null;     // Use any for appState for now
    files?: any;
  } | null;
  onChange?: (elements: readonly any[], appState: any, files: any) => void; // Use any for types
}

// Define ref type using any for now
export interface ExcalidrawWrapperRef {
  getSceneElements: () => readonly any[];
  getAppState: () => any;
}

export const ExcalidrawWrapper = React.forwardRef<ExcalidrawWrapperRef, ExcalidrawWrapperProps>(
  ({ initialData, onChange }, ref) => {
    const { i18n } = useTranslation();
    // Use any for the API state type
    const [excalidrawAPI, setExcalidrawAPI] = useState<any | null>(null);

    // Callback ref to get the API instance
    const excalidrawRefCallback = useCallback((api: any | null) => { // Use any for api type
        if (api) {
            setExcalidrawAPI(api);
        }
    }, []);

    React.useImperativeHandle(ref, () => ({
      getSceneElements: () => {
        return excalidrawAPI?.getSceneElements() || [];
      },
      getAppState: () => {
        return excalidrawAPI?.getAppState() || {}; // Return empty object as default
      }
    }));

    console.log("Rendering ExcalidrawWrapper with initialData:", initialData);

    // Use useEffect to potentially update Excalidraw instance if initialData changes
    // This is often needed if Excalidraw doesn't automatically react to initialData prop changes
    useEffect(() => {
        if (excalidrawAPI && initialData) {
            console.log("Updating Excalidraw scene with new initialData");
            // Ensure initialData structure matches what updateScene expects, even with 'any' types
            const sceneData = {
                elements: initialData.elements,
                appState: initialData.appState ?? {}, // Provide default empty object for appState
                files: initialData.files
            };
            excalidrawAPI.updateScene(sceneData);
        }
    }, [initialData, excalidrawAPI]);


    return (
      <div style={{ height: "100%", width: "100%" }}>
        <Excalidraw
          // Use the excalidrawAPI prop to get the API instance
          excalidrawAPI={excalidrawRefCallback}
          initialData={initialData}
          onChange={onChange}
          langCode={i18n.language.startsWith('zh') ? 'zh-CN' : 'en'}
        />
      </div>
    );
  }
);

ExcalidrawWrapper.displayName = "ExcalidrawWrapper";