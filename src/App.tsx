// vite-project/src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from "react"; // Add useCallback
import { useTranslation } from 'react-i18next';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import "./panel-styles.css";
import { GithubPatInput } from "./components/GithubPatInput";
import { GithubFileBrowser, GithubFileBrowserRef } from "./components/GithubFileBrowser"; // Import ref type
import { ExcalidrawWrapper, ExcalidrawWrapperRef } from "./components/ExcalidrawWrapper";
import { SaveFileDialog } from "./components/SaveFileDialog"; // Import SaveFileDialog
import { getPat } from "./lib/db";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings, Plus, GitBranch, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
const LOCALSTORAGE_KEY_PREFERRED_REPO = 'preferredRepoIdentifier';


// --- Interfaces and API Helpers ---
interface Repo { id: number; name: string; full_name: string; private: boolean; }
interface Branch { name: string; commit: { sha: string; url: string; }; protected: boolean; }
const GITHUB_API_BASE = "https://api.github.com";

async function fetchUserRepos(pat: string): Promise<Repo[]> {
    const response = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`获取仓库失败: ${response.status} ${errorData.message || ''}`); }
    return response.json();
}
async function fetchRepoBranches(pat: string, repoFullName: string): Promise<Branch[]> {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/branches`, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`获取分支失败: ${response.status} ${errorData.message || ''}`); }
    return response.json();
}

// Helper to get file content
async function getGithubFileContent(pat: string, repoFullName: string, path: string, branch: string): Promise<string> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}?ref=${branch}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `token ${pat}`,
            Accept: "application/vnd.github.v3+json",
        },
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`获取文件内容失败 (${path}): ${response.status} ${errorData.message || ''}`);
    }
    const data = await response.json();
    if (data.encoding !== 'base64') {
        throw new Error(`未知的 GitHub 文件编码: ${data.encoding}`);
    }
    // Decode base64 content
    const decodedContent = decodeURIComponent(escape(atob(data.content)));
    return decodedContent;
}
// --- End API Helpers ---


function App() {
  const { t } = useTranslation();
  const [currentPat, setCurrentPat] = useState<string | null>(null);
  const [isLoadingPat, setIsLoadingPat] = useState(true);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [repoBranchError, setRepoBranchError] = useState<string | null>(null);
  const [showCreateFileDialog, setShowCreateFileDialog] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [createFileError, setCreateFileError] = useState<string | null>(null);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // State for opened Excalidraw file
  const [openedFilePath, setOpenedFilePath] = useState<string | null>(null);
  const [openedFileContent, setOpenedFileContent] = useState<any | null>(null); // Using any for now
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileLoadingError, setFileLoadingError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null); // 新增：状态来存储选中的文件路径

  const browserRef = useRef<GithubFileBrowserRef>(null);
  const excalidrawWrapperRef = useRef<ExcalidrawWrapperRef>(null); // Ref for ExcalidrawWrapper

  // State for tracking modified files
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());

  // State for Save Prompt Dialog (when switching files)
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [nextFilePathToOpen, setNextFilePathToOpen] = useState<string | null>(null); // File to open after prompt

  // State for Commit Dialog (triggered by Save menu or Save prompt)
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [fileToSavePath, setFileToSavePath] = useState<string | null>(null);
  const [fileToOpenAfterCreate, setFileToOpenAfterCreate] = useState<string | null>(null); // State to trigger opening after creation

   useEffect(() => { /* Load PAT */
        async function fetchPat() {
            setIsLoadingPat(true);
            try { const storedPat = await getPat(); if (storedPat) setCurrentPat(storedPat); }
            catch (error) { console.error("Failed to fetch PAT:", error); }
            finally { setIsLoadingPat(false); }
        }
        fetchPat();
    }, []);
   useEffect(() => { /* Load Repos with localStorage persistence */
        async function loadRepos() {
            if (!currentPat) return;
            setIsLoadingRepos(true);
            setRepoBranchError(null);
            setSelectedRepo(null); // Reset selection initially
            setSelectedBranch(null);
            setRepos([]);
            setBranches([]);

            let preferredRepo: string | null = null;
            try {
                preferredRepo = localStorage.getItem(LOCALSTORAGE_KEY_PREFERRED_REPO);
            } catch (error) {
                console.error("Error reading preferred repo from localStorage:", error);
                // Optionally notify the user or log this error
            }

            try {
                const fetchedRepos = await fetchUserRepos(currentPat);
                setRepos(fetchedRepos);

                let repoToSelect: string | null = null;
                if (fetchedRepos.length > 0) {
                    // Try to select the preferred repo if it exists in the fetched list
                    if (preferredRepo && fetchedRepos.some(repo => repo.full_name === preferredRepo)) {
                        repoToSelect = preferredRepo;
                    } else {
                        // Fallback to the first repo if preferred is invalid or not found
                        repoToSelect = fetchedRepos[0].full_name;
                        // Clear invalid preferred repo from localStorage
                        if (preferredRepo) {
                            try {
                                localStorage.removeItem(LOCALSTORAGE_KEY_PREFERRED_REPO);
                            } catch (error) {
                                console.error("Error removing invalid preferred repo from localStorage:", error);
                            }
                        }
                    }
                }
                setSelectedRepo(repoToSelect); // Set the selected repo state

            } catch (err: any) {
                setRepoBranchError(err.message || t('app.loadingErrorTitle'));
            } finally {
                setIsLoadingRepos(false);
            }
        }
        loadRepos();
    }, [currentPat, t]); // Dependency array remains the same
   useEffect(() => { /* Load Branches */
        async function loadBranches() {
            if (!currentPat || !selectedRepo) return;
            setIsLoadingBranches(true); setRepoBranchError(null); setSelectedBranch(null); setBranches([]);
            try { const fetchedBranches = await fetchRepoBranches(currentPat, selectedRepo); setBranches(fetchedBranches); if (fetchedBranches.length > 0) { const main = fetchedBranches.find(b => b.name === 'main'); const master = fetchedBranches.find(b => b.name === 'master'); if (main) setSelectedBranch(main.name); else if (master) setSelectedBranch(master.name); else setSelectedBranch(fetchedBranches[0].name); } else { setSelectedBranch(null); } }
            catch (err: any) { setRepoBranchError(err.message || t('app.loadingErrorTitle')); }
            finally { setIsLoadingBranches(false); }
        }
        loadBranches();
    }, [currentPat, selectedRepo, t]);

   const handlePatSaved = (newPat: string) => { setCurrentPat(newPat); setShowSettingsDialog(false); };
   const handlePatCleared = () => { setCurrentPat(null); setRepos([]); setSelectedRepo(null); setBranches([]); setSelectedBranch(null); setRepoBranchError(null); setShowSettingsDialog(false); };
   const handleRepoChange = (repoFullName: string) => {
        setSelectedRepo(repoFullName);
        setSelectedFilePath(null); // 新增：切换仓库时清除选中文件
        setOpenedFilePath(null);
        setOpenedFileContent(null);
        // Save the selected repo to localStorage
        try {
            localStorage.setItem(LOCALSTORAGE_KEY_PREFERRED_REPO, repoFullName);
        } catch (error) {
            console.error("Error saving preferred repo to localStorage:", error);
            // Optionally notify the user or handle the error (e.g., storage full)
        }
    };
   const handleBranchChange = (branchName: string) => { setSelectedBranch(branchName); setSelectedFilePath(null); setOpenedFilePath(null); setOpenedFileContent(null); }; // 新增：切换分支时清除选中文件
   const handleCreateFileSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmedPath = newFilePath.trim();
        if (!trimmedPath || !browserRef.current) return;
        if (trimmedPath.startsWith('/') || trimmedPath.endsWith('/') || trimmedPath.includes('//')) { setCreateFileError(t('createFileDialog.formatError')); return; }
        setIsCreatingFile(true);
        setCreateFileError(null);
        let finalPath = ''; // Define finalPath outside try
        try {
            finalPath = trimmedPath.endsWith('.excalidraw') ? trimmedPath : `${trimmedPath}.excalidraw`;
            await browserRef.current.createFile(trimmedPath); // Call the create method
            setShowCreateFileDialog(false);
            setNewFilePath('');
            // --- REMOVED immediate refreshTree call ---
            // Set state to trigger opening in useEffect
            console.log(`[DEBUG] App: File created, setting state to open: ${finalPath}`);
            setFileToOpenAfterCreate(finalPath); // Trigger useEffect to open the file
        } catch (error: any) {
            setCreateFileError(error.message || t('createFileDialog.apiError', { filePath: trimmedPath, error: 'Unknown error' }));
        } finally {
            setIsCreatingFile(false); // Correctly placed finally block
        }
    };

  // --- Effect to open file after creation ---
  useEffect(() => {
      if (fileToOpenAfterCreate) {
          console.log(`[DEBUG] App: useEffect triggered to open file: ${fileToOpenAfterCreate}`);
          handleFileNodeClick(fileToOpenAfterCreate);
          setFileToOpenAfterCreate(null); // Reset the trigger state
      }
  }, [fileToOpenAfterCreate]); // Dependency on the trigger state

  // --- Handler for file node click ---
  // Function to actually load the file content
  const loadFileContent = async (filePathToLoad: string) => {
      if (!currentPat || !selectedRepo || !selectedBranch) return;

      console.log("Opening Excalidraw file:", filePathToLoad);
      setIsFileLoading(true);
      setFileLoadingError(null);
      setSelectedFilePath(filePathToLoad); // Highlight the selected file
      setOpenedFilePath(filePathToLoad);   // Mark it as the currently opened file
      setOpenedFileContent(null);        // Clear previous content while loading

      try {
          const rawContent = await getGithubFileContent(currentPat, selectedRepo, filePathToLoad, selectedBranch);
          try {
              const parsedData = JSON.parse(rawContent);
              if (parsedData && Array.isArray(parsedData.elements)) {
                  setOpenedFileContent({
                      elements: parsedData.elements,
                      appState: parsedData.appState
                  });
                  // Successfully loaded, ensure it's not marked as modified initially
                  setModifiedFiles(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(filePathToLoad);
                      return newSet;
                  });
              } else {
                  throw new Error("Invalid Excalidraw file format (missing 'elements' array).");
              }
          } catch (parseError: any) {
              console.error("Failed to parse Excalidraw content:", parseError);
              throw new Error(`文件 "${filePathToLoad}" 不是有效的 Excalidraw JSON 格式: ${parseError.message}`);
          }
      } catch (error: any) {
          console.error("Failed to load file content:", error);
          setFileLoadingError(error.message);
          setOpenedFilePath(null); // Clear opened file path on error
          setOpenedFileContent(null);
          // Keep selectedFilePath so user knows which file failed
      } finally {
          setIsFileLoading(false);
      }
  };

  // --- Handler for file node click ---
  const handleFileNodeClick = (filePath: string) => {
      // Prevent action if already loading or same file clicked
      if (isFileLoading || filePath === openedFilePath) {
          return;
      }

      // Handle non-excalidraw files (just select, don't open/prompt)
      if (!filePath.toLowerCase().endsWith('.excalidraw')) {
          console.log("Clicked non-excalidraw file:", filePath);
          setSelectedFilePath(filePath);
          // Optionally clear the editor if a non-excalidraw file is selected
          // setOpenedFilePath(null);
          // setOpenedFileContent(null);
          return;
      }

      // Check if the CURRENTLY opened file has unsaved changes
      if (openedFilePath && modifiedFiles.has(openedFilePath)) {
          console.log(`Current file ${openedFilePath} has modifications. Prompting user.`);
          setNextFilePathToOpen(filePath); // Store the file user wants to open
          setShowSaveDialog(true);       // Show the save prompt dialog
      } else {
          // No modifications or no file currently open, proceed to load the new file
          loadFileContent(filePath);
      }

  };

  // --- Handler to trigger the commit dialog ---
  const handleSaveRequest = (filePathToSave: string) => {
      console.log(`%c[DEBUG] App: handleSaveRequest TRIGGERED for: ${filePathToSave}`, 'color: blue; font-weight: bold;');
      console.log(`Save requested for: ${filePathToSave}`);
      setFileToSavePath(filePathToSave);
      setShowCommitDialog(true); // This will eventually open the SaveFileDialog component
  };

  // --- Handlers for the Save Prompt Dialog ---
  const handlePromptSave = () => {
      setShowSaveDialog(false);
      if (openedFilePath) {
          handleSaveRequest(openedFilePath); // Trigger save for the *current* file
      }
      // TODO: Consider what happens if save fails. Should we still open the next file?
      // For now, we assume save will eventually succeed or handle its own errors via SaveFileDialog
      // and we clear the next file path. A more robust solution might wait for save confirmation.
      setNextFilePathToOpen(null);
  };

  const handlePromptDiscard = () => {
      setShowSaveDialog(false);
      if (openedFilePath) {
          // Remove the modification flag
          setModifiedFiles(prev => {
              const newSet = new Set(prev);
              newSet.delete(openedFilePath);
              console.log(`Discarded changes for: ${openedFilePath}`);
              return newSet;
          });
      }
      // Proceed to load the next file
      if (nextFilePathToOpen) {
          loadFileContent(nextFilePathToOpen);
      }
      setNextFilePathToOpen(null);
  };

  const handlePromptCancel = () => {
      setShowSaveDialog(false);
      setNextFilePathToOpen(null); // Reset the intended action
      console.log("Save prompt cancelled.");
  };

  // --- Callbacks for SaveFileDialog ---
  const handleSaveSuccess = (savedFilePath: string, newSha: string) => { // Add newSha
      console.log(`%c[DEBUG] App: handleSaveSuccess CALLED for ${savedFilePath} with new SHA ${newSha}`, 'color: green; font-weight: bold;');
      console.log(`[DEBUG] App: handleSaveSuccess called for ${savedFilePath} with new SHA ${newSha}`);
      setShowCommitDialog(false);
      setFileToSavePath(null);
      // Remove modification flag
      setModifiedFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(savedFilePath);
          console.log(`[DEBUG] App: Removed modification flag for: ${savedFilePath}`);
          return newSet;
      });
      // Update ExcalidrawWrapper's baseline to prevent immediate re-flagging as modified
      const latestContent = getLatestExcalidrawContent(); // Get current content
      if (latestContent && excalidrawWrapperRef.current) {
          console.log("[DEBUG] App: Updating ExcalidrawWrapper original state after save.");
          excalidrawWrapperRef.current.updateOriginalState(latestContent.elements);
      } else {
          console.warn("[DEBUG] App: Could not update ExcalidrawWrapper original state after save (ref or content missing).");
      }
      // Force refresh the file tree to get the latest SHAs from GitHub
      console.log("[DEBUG] App: Refreshing file tree after successful save.");
      browserRef.current?.refreshTree(); // Ensure this line is active

      // If save was triggered by switching files, load the next file now
      if (nextFilePathToOpen) {
          console.log(`[DEBUG] App: Loading next file after save: ${nextFilePathToOpen}`);
          loadFileContent(nextFilePathToOpen);
          setNextFilePathToOpen(null);
      }
  };

  const handleSaveCancel = () => {
      setShowCommitDialog(false);
      setFileToSavePath(null);
      console.log("Save cancelled.");
      // If save was cancelled after a prompt, don't open the next file
      if (nextFilePathToOpen) {
          console.log("Save cancelled, not opening next file:", nextFilePathToOpen);
          setNextFilePathToOpen(null);
      }
  };

  const handleSaveError = (error: Error) => {
      // Error is already logged in SaveFileDialog, maybe show a toast or alert here
      console.error("Save failed in App:", error.message);
      // Keep the dialog open for the user to see the error message within it
      // Optionally, display a more user-friendly message in App's UI
      // setAppLevelError(`Failed to save file: ${error.message}`);
  };

  // --- Function to get latest content from Excalidraw ---
  const getLatestExcalidrawContent = useCallback(() => {
      if (excalidrawWrapperRef.current) {
          return {
              elements: excalidrawWrapperRef.current.getSceneElements(),
              appState: excalidrawWrapperRef.current.getAppState(),
          };
      }
      console.error("Excalidraw ref not available to get content.");
      return null;
  }, []); // No dependencies needed if ref itself doesn't change

  // --- Handler for Excalidraw content change ---
  const handleExcalidrawChange = useCallback((
      _elements: readonly any[],
      _appState: any,
      _files: any,
      isModified: boolean
  ) => {
      console.log(`[DEBUG] App: handleExcalidrawChange called for ${openedFilePath} with isModified: ${isModified}`);
      if (openedFilePath) {
          setModifiedFiles(prev => {
              const newSet = new Set(prev);
              const currentlyMarked = newSet.has(openedFilePath);
              if (isModified) {
                  if (!currentlyMarked) {
                      console.log(`[DEBUG] App: Marking file as modified: ${openedFilePath}`);
                      newSet.add(openedFilePath);
                  }
              } else {
                  if (currentlyMarked) {
                      console.log(`[DEBUG] App: Marking file as unmodified: ${openedFilePath}`);
                      console.log(`File marked as unmodified: ${openedFilePath}`);
                      newSet.delete(openedFilePath);
                  }
              }
              // Only return a new Set object if it actually changed to avoid unnecessary re-renders
              if ((isModified && !currentlyMarked) || (!isModified && currentlyMarked)) {
                  return newSet;
              }
              return prev; // Return previous state if no change
          });
      }
  }, [openedFilePath]); // Dependency: openedFilePath


  return (<> {/* Wrap in fragment */}
    <PanelGroup direction="horizontal" className="h-screen w-screen">
      <Panel defaultSize={20} minSize={20} maxSize={50} className="bg-gray-100 p-4 flex flex-col">
        {/* Header Section: Repo Selector and Settings Button */}
        <div className="flex items-center space-x-2 mb-2 flex-shrink-0">
          {currentPat && (
            <>
              <Select value={selectedRepo ?? ""} onValueChange={handleRepoChange} disabled={isLoadingRepos || repos.length === 0}>
                <SelectTrigger id="repo-select-app" className="flex-grow min-w-[180px]">
                  <span className="mr-2">{t('app.repoSelectorTitle')}</span>
                  <SelectValue placeholder={isLoadingRepos ? t('app.repoSelectPlaceholderLoading') : t('app.repoSelectPlaceholderSelect')} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingRepos ? <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('app.repoSelectPlaceholderLoading')}</SelectItem>
                   : repos.length === 0 ? <SelectItem value="no-repos" disabled>{t('app.repoSelectPlaceholderNoRepos')}</SelectItem>
                   : repos.map(repo => <SelectItem key={repo.id} value={repo.full_name}>{repo.full_name} {repo.private ? "🔒" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" title={t('app.settingsButtonTitle')}><Settings className="h-4 w-4" /></Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>{t('patInput.title')}</DialogTitle>
                    <DialogDescription>{t('patInput.description')}</DialogDescription>
                  </DialogHeader>
                  <GithubPatInput initialPat={currentPat} onPatSaved={handlePatSaved} onPatCleared={handlePatCleared} />
                   <DialogFooter>
                       <DialogClose asChild><Button type="button" variant="outline">{t('patInput.closeButton')}</Button></DialogClose>
                   </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
        {/* Branch Selector and Create Button Section */}
        {currentPat && (
          <div className="flex items-center space-x-2 mb-4 flex-shrink-0">
            <Select value={selectedBranch ?? ""} onValueChange={handleBranchChange} disabled={!selectedRepo || isLoadingBranches || branches.length === 0}>
              <SelectTrigger id="branch-select-app" className="flex-grow min-w-[100px]">
                <SelectValue placeholder={isLoadingBranches ? t('app.branchSelectPlaceholderLoading') : t('app.branchSelectPlaceholderSelect')} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingBranches ? <SelectItem value="loading" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('app.branchSelectPlaceholderLoading')}</SelectItem>
                 : branches.length === 0 ? <SelectItem value="no-branches" disabled>{selectedRepo ? t('app.branchSelectPlaceholderNoBranches') : t('app.branchSelectPlaceholderNoRepo')}</SelectItem>
                 : branches.map(branch => <SelectItem key={branch.commit.sha} value={branch.name}><GitBranch className="mr-2 h-4 w-4" />{branch.name} {branch.protected ? "🛡️" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={showCreateFileDialog} onOpenChange={setShowCreateFileDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" disabled={!selectedBranch} title={t('app.createFileButtonTitle')}><Plus className="h-4 w-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                 <DialogHeader>
                    <DialogTitle>{t('createFileDialog.title')}</DialogTitle>
                    {/* <DialogDescription>{t('createFileDialog.description')}</DialogDescription> */}
                    </DialogHeader>
                    <form onSubmit={handleCreateFileSubmit} className="space-y-4">
                    <div className="space-y-2">
                        {/* <Label htmlFor="new-file-path-app">{t('createFileDialog.pathLabel')}</Label> */}
                        <div className="flex items-center space-x-1">
                          <Input id="new-file-path-app" className="flex-grow" value={newFilePath} onChange={(e) => { setNewFilePath(e.target.value); setCreateFileError(null); }} placeholder={t('createFileDialog.pathPlaceholder')} disabled={isCreatingFile} required />
                          <span className="text-sm text-muted-foreground flex-shrink-0">.excalidraw</span>
                        </div>
                    </div>
                    {createFileError && <Alert variant="destructive"><AlertTitle>{t('createFileDialog.title')}</AlertTitle><AlertDescription>{t('createFileDialog.apiError', { filePath: newFilePath, error: createFileError })}</AlertDescription></Alert>}
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isCreatingFile}>{t('createFileDialog.cancelButton')}</Button></DialogClose>
                        <Button type="submit" disabled={isCreatingFile || !newFilePath.trim()}>
                        {isCreatingFile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isCreatingFile ? t('createFileDialog.creatingButton') : t('createFileDialog.createButton')}
                        </Button>
                    </DialogFooter>
                    </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
        {/* Repo/Branch Loading Errors */}
        {repoBranchError && (
            <Alert variant="destructive" className="mb-4 flex-shrink-0">
                <AlertTitle>{t('app.loadingErrorTitle')}</AlertTitle>
                <AlertDescription>{repoBranchError}</AlertDescription>
            </Alert>
        )}
        {/* Main Content Area (Left Panel) */}
        <div className="flex-grow overflow-y-auto">
          {isLoadingPat ? (
            <div className="flex items-center justify-center h-20"><p className="text-muted-foreground">{t('app.loadingPat')}</p></div>
          ) : currentPat ? (
            <GithubFileBrowser
                ref={browserRef}
                pat={currentPat}
                selectedRepo={selectedRepo}
                selectedBranch={selectedBranch}
                onFileNodeClick={handleFileNodeClick}
                selectedFilePath={selectedFilePath}
                modifiedFiles={modifiedFiles} // Pass down modified files set
                onSaveRequest={handleSaveRequest} // Pass down save request handler
            />
          ) : (
            <GithubPatInput onPatSaved={handlePatSaved} onPatCleared={handlePatCleared} />
          )}
        </div>
      </Panel>

      <PanelResizeHandle className="flex items-center justify-center w-2 bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors duration-150 ease-in-out group">
         <div className="flex flex-col space-y-1 group-hover:space-y-[5px] transition-all duration-150 ease-in-out">
          <div className="w-1 h-1 bg-gray-500 rounded-full group-hover:bg-blue-600"></div>
          <div className="w-1 h-1 bg-gray-500 rounded-full group-hover:bg-blue-600"></div>
          <div className="w-1 h-1 bg-gray-500 rounded-full group-hover:bg-blue-600"></div>
        </div>
      </PanelResizeHandle>

      {/* Right Panel - Excalidraw Area */}
      <Panel defaultSize={80} className="bg-white flex flex-col">
        {isFileLoading ? (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                正在加载文件... {/* TODO: Translate */}
            </div>
        ) : fileLoadingError ? (
            <div className="flex-grow flex items-center justify-center p-4">
                 <Alert variant="destructive">
                    <AlertTitle>{t('app.loadingErrorTitle')}</AlertTitle>
                    <AlertDescription>{fileLoadingError}</AlertDescription>
                </Alert>
            </div>
        ) : openedFilePath && openedFileContent ? (
            <ExcalidrawWrapper
                key={openedFilePath}
                ref={excalidrawWrapperRef} // Assign ref
                initialData={openedFileContent}
                onChange={handleExcalidrawChange} // Pass the change handler
            />
        ) : (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
                在左侧文件树中选择一个 .excalidraw 文件以开始编辑。 {/* TODO: Translate */}
            </div>
        )}
      </Panel>
    </PanelGroup>

    {/* Save Prompt Dialog */}
    <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('savePrompt.title', 'Save Changes?')}</DialogTitle> {/* Added default text */}
          <DialogDescription>
            {t('savePrompt.description', 'The file "{{fileName}}" has unsaved changes. Do you want to save them before opening the next file?', { fileName: openedFilePath?.split('/').pop() || 'current file' })} {/* Added default text */}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handlePromptCancel}>{t('savePrompt.cancelButton', 'Cancel')}</Button> {/* Added default text */}
          <Button variant="destructive" onClick={handlePromptDiscard}>{t('savePrompt.discardButton', 'Discard')}</Button> {/* Added default text */}
          <Button onClick={handlePromptSave}>{t('savePrompt.saveButton', 'Save')}</Button> {/* Added default text */}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Save File Dialog (Commit Message) */}
    <SaveFileDialog
      isOpen={showCommitDialog}
      onOpenChange={setShowCommitDialog}
      filePathToSave={fileToSavePath}
      pat={currentPat}
      repoFullName={selectedRepo}
      branchName={selectedBranch}
      getLatestContent={getLatestExcalidrawContent}
      onSaveSuccess={handleSaveSuccess} // Updated signature is compatible
      onSaveCancel={handleSaveCancel}
      onSaveError={handleSaveError}
    />

  </>); // Wrap in fragment
}

export default App;
