// vite-project/src/components/GithubFileBrowser.tsx
import { useRef, forwardRef, useImperativeHandle } from 'react'; // Removed unused React import
import { useTranslation } from 'react-i18next'; // Import useTranslation
import { GithubFileTree, GithubFileTreeRef } from "./GithubFileTree";

interface GithubFileBrowserProps {
  pat: string;
  selectedRepo: string | null;
  selectedBranch: string | null;
  onFileNodeClick: (filePath: string) => void;
  selectedFilePath: string | null;
  modifiedFiles: Set<string>; // Add prop for modified files
  onSaveRequest: (filePath: string) => void; // Add prop for save requests
}

// Define the type for the exposed ref methods from this component
export interface GithubFileBrowserRef {
  createFile: (filePath: string) => Promise<void>;
  refreshTree: () => void;
}

// Use forwardRef
export const GithubFileBrowser = forwardRef<GithubFileBrowserRef, GithubFileBrowserProps>(
  ({ pat, selectedRepo, selectedBranch, onFileNodeClick, selectedFilePath, modifiedFiles, onSaveRequest }, ref) => { // Add new props
    const { t } = useTranslation(); // Initialize hook
    const fileTreeRef = useRef<GithubFileTreeRef>(null);

    // Expose methods from the nested GithubFileTree component
    useImperativeHandle(ref, () => ({
      createFile: async (filePath: string) => {
        if (fileTreeRef.current) {
          await fileTreeRef.current.createFile(filePath);
        } else {
          console.error("File tree ref not available");
          throw new Error("文件树组件尚未准备好。");
        }
      },
      refreshTree: () => {
         if (fileTreeRef.current) {
          fileTreeRef.current.refreshTree();
        } else {
          console.error("File tree ref not available for refresh");
        }
      }
    }));

    return (
      // Add h-full flex flex-col to allow height filling and column layout
      <div className="space-y-4 h-full flex flex-col">
        {/* File Tree */}
        {/* Add flex-grow to make this div take remaining space */}
        <div className="flex-grow">
          {(selectedRepo && selectedBranch) ? (
            <GithubFileTree
                ref={fileTreeRef} // Assign the ref
                pat={pat}
                repoFullName={selectedRepo}
                branchName={selectedBranch}
                onFileNodeClick={onFileNodeClick} // Pass handler down
                selectedFilePath={selectedFilePath}
                modifiedFiles={modifiedFiles} // Pass down modified files
                onSaveRequest={onSaveRequest} // Pass down save request handler
            />
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              {t('fileTree.empty')} {/* Or a more specific message like "Select repo/branch" */}
            </div>
          )}
        </div>
      </div>
    );
  }
);

GithubFileBrowser.displayName = "GithubFileBrowser"; // Add display name