// vite-project/src/App.tsx
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import "./panel-styles.css";
import { GithubPatInput } from "./components/GithubPatInput";
import { GithubFileBrowser, GithubFileBrowserRef } from "./components/GithubFileBrowser"; // Import ref type
import { ExcalidrawWrapper } from "./components/ExcalidrawWrapper"; // Import ExcalidrawWrapper
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

  const browserRef = useRef<GithubFileBrowserRef>(null);

   useEffect(() => { /* Load PAT */
        async function fetchPat() {
            setIsLoadingPat(true);
            try { const storedPat = await getPat(); if (storedPat) setCurrentPat(storedPat); }
            catch (error) { console.error("Failed to fetch PAT:", error); }
            finally { setIsLoadingPat(false); }
        }
        fetchPat();
    }, []);
   useEffect(() => { /* Load Repos */
        async function loadRepos() {
            if (!currentPat) return;
            setIsLoadingRepos(true); setRepoBranchError(null); setSelectedRepo(null); setSelectedBranch(null); setRepos([]); setBranches([]);
            try { const fetchedRepos = await fetchUserRepos(currentPat); setRepos(fetchedRepos); if (fetchedRepos.length > 0) { setSelectedRepo(fetchedRepos[0].full_name); } }
            catch (err: any) { setRepoBranchError(err.message || t('app.loadingErrorTitle')); }
            finally { setIsLoadingRepos(false); }
        }
        loadRepos();
    }, [currentPat, t]);
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
   const handleRepoChange = (repoFullName: string) => { setSelectedRepo(repoFullName); setOpenedFilePath(null); setOpenedFileContent(null); };
   const handleBranchChange = (branchName: string) => { setSelectedBranch(branchName); setOpenedFilePath(null); setOpenedFileContent(null); };
   const handleCreateFileSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const trimmedPath = newFilePath.trim();
        if (!trimmedPath || !browserRef.current) return;
        if (trimmedPath.startsWith('/') || trimmedPath.endsWith('/') || trimmedPath.includes('//')) { setCreateFileError(t('createFileDialog.formatError')); return; }
        setIsCreatingFile(true); setCreateFileError(null);
        try { await browserRef.current.createFile(trimmedPath); setShowCreateFileDialog(false); setNewFilePath(''); }
        catch (error: any) { setCreateFileError(error.message || t('createFileDialog.apiError', { filePath: trimmedPath, error: 'Unknown error' })); }
        finally { setIsCreatingFile(false); }
    };

  // --- Handler for file node click ---
  const handleFileNodeClick = async (filePath: string) => {
      if (!filePath.toLowerCase().endsWith('.excalidraw')) {
          console.log("Clicked non-excalidraw file:", filePath);
          setOpenedFilePath(null);
          setOpenedFileContent(null);
          return;
      }
      if (!currentPat || !selectedRepo || !selectedBranch) return;

      console.log("Opening Excalidraw file:", filePath);
      setIsFileLoading(true);
      setFileLoadingError(null);
      setOpenedFilePath(filePath);
      setOpenedFileContent(null);

      try {
          const rawContent = await getGithubFileContent(currentPat, selectedRepo, filePath, selectedBranch);
          try {
              const parsedData = JSON.parse(rawContent);
              if (parsedData && Array.isArray(parsedData.elements)) {
                  setOpenedFileContent({
                      elements: parsedData.elements,
                      appState: parsedData.appState
                  });
              } else {
                  throw new Error("Invalid Excalidraw file format (missing 'elements' array).");
              }
          } catch (parseError: any) {
              console.error("Failed to parse Excalidraw content:", parseError);
              throw new Error(`文件 "${filePath}" 不是有效的 Excalidraw JSON 格式: ${parseError.message}`);
          }
      } catch (error: any) {
          console.error("Failed to load file content:", error);
          setFileLoadingError(error.message);
          setOpenedFilePath(null);
          setOpenedFileContent(null);
      } finally {
          setIsFileLoading(false);
      }
  };


  return (
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
                    <DialogDescription>{t('createFileDialog.description')}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateFileSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-file-path-app">{t('createFileDialog.pathLabel')}</Label>
                        <Input id="new-file-path-app" value={newFilePath} onChange={(e) => { setNewFilePath(e.target.value); setCreateFileError(null); }} placeholder={t('createFileDialog.pathPlaceholder')} disabled={isCreatingFile} required />
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
                onFileNodeClick={handleFileNodeClick} // Pass the handler
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
                initialData={openedFileContent}
                // onChange={handleExcalidrawChange} // Add this in Phase 2
            />
        ) : (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
                在左侧文件树中选择一个 .excalidraw 文件以开始编辑。 {/* TODO: Translate */}
            </div>
        )}
      </Panel>
    </PanelGroup>
  );
}

export default App;
