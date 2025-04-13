// vite-project/src/components/ExcalidrawWrapper.tsx
import React, { useEffect, useState, useCallback } from 'react';
import debounce from 'lodash.debounce'; // Import debounce
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
  // Update onChange prop type to include isModified
  onChange?: (elements: readonly any[], appState: any, files: any, isModified: boolean) => void;
}

// Define ref type using any for now
export interface ExcalidrawWrapperRef {
  getSceneElements: () => readonly any[];
  getAppState: () => any;
  updateOriginalState: (elements: readonly any[]) => void; // Add method to update baseline
}

export const ExcalidrawWrapper = React.forwardRef<ExcalidrawWrapperRef, ExcalidrawWrapperProps>(
  ({ initialData, onChange }, ref) => {
    const { i18n } = useTranslation();
    // Use any for the API state type
    const [excalidrawAPI, setExcalidrawAPI] = useState<any | null>(null);
    const [originalElementsString, setOriginalElementsString] = useState<string>('');

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
      },
      updateOriginalState: (elements: readonly any[]) => {
        console.log('[DEBUG] ExcalidrawWrapper: Updating original elements string after save.');
        const newBaseline = JSON.stringify(elements);
        console.log(`[DEBUG]   - New Baseline String (start): ${newBaseline.substring(0, 80)}...`);
        setOriginalElementsString(newBaseline);
      }
    }));

    console.log("Rendering ExcalidrawWrapper with initialData:", initialData);

    // Store initial elements as string when component mounts or initialData changes
    useEffect(() => {
        if (excalidrawAPI && initialData?.elements) {
            console.log("[DEBUG] ExcalidrawWrapper: Updating scene with initialData.");
            // Don't set original string here yet
            // setOriginalElementsString(JSON.stringify(initialData.elements)); // REMOVED

            const sceneData = {
                elements: initialData.elements,
                appState: initialData.appState ?? {},
                files: initialData.files
            };
            excalidrawAPI.updateScene(sceneData);

            // Set the baseline AFTER Excalidraw processes the update
            setTimeout(() => {
                if (excalidrawAPI) { // Check API still exists
                    const currentElements = excalidrawAPI.getSceneElements();
                    const baselineString = JSON.stringify(currentElements);
                    console.log(`[DEBUG] ExcalidrawWrapper: Setting baseline originalElementsString after updateScene (start): ${baselineString.substring(0, 80)}...`);
                    setOriginalElementsString(baselineString);
                }
            }, 0); // Delay of 0ms pushes execution after current stack
        } else if (!initialData) {
            // Clear original string if initialData is null (e.g., file closed)
            setOriginalElementsString('');
        }
    }, [initialData, excalidrawAPI]); // Keep dependencies

    // Debounced function to perform comparison and notify parent
    const debouncedCompareAndNotify = useCallback(
        debounce((elements: readonly any[], appState: any, files: any) => {
            // Ensure originalElementsString has been set before comparing
            if (originalElementsString === '') {
                console.log('[DEBUG] ExcalidrawWrapper: Skipping comparison, original string not set yet.');
                return; // Don't compare if baseline isn't ready
            }
            const currentString = JSON.stringify(elements);
            const isModified = currentString !== originalElementsString;
            console.log('[DEBUG] ExcalidrawWrapper: debouncedCompareAndNotify');
            console.log(`[DEBUG]   - Original Elements String (start): ${originalElementsString.substring(0, 80)}...`);
            console.log(`[DEBUG]   - Current Elements String (start):  ${currentString.substring(0, 80)}...`);
            console.log(`[DEBUG]   - Strings Equal: ${currentString === originalElementsString}`);
            console.log(`[DEBUG]   - Calculated isModified: ${isModified}`);
            // Call the actual onChange prop passed from App.tsx
            if (onChange) {
                onChange(elements, appState, files, isModified);
            }
        }, 500), // Debounce delay 500ms
        [originalElementsString, onChange] // Dependencies
    );

    // Raw onChange handler from Excalidraw
    const handleRawExcalidrawChange = (elements: readonly any[], appState: any, files: any) => {
        // Trigger the debounced comparison and notification
        debouncedCompareAndNotify(elements, appState, files);
    };


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