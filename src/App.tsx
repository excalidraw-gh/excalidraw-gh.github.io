// vite-project/src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from "react"; // Add useCallback
import { useNavigate, useLocation } from 'react-router-dom'; // 添加路由hooks
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
import { CacheManager } from "./components/CacheManager"; // 添加缓存管理器导入
import { getPat, getCachedFile, getAllCachedFiles, deleteCachedFile, saveCachedFile, CachedFileData } from "./lib/db"; // 添加缓存相关导入
import { createSceneSnapshot, ExcalidrawSceneData, normalizeSceneData } from "./lib/excalidrawScene";
import { parseRouteParams, buildFileRoute, buildRepoRoute } from "./lib/router"; // 添加路由工具导入
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Settings, Plus, GitBranch, Loader2, Database, Save } from 'lucide-react'; // 添加Database图标
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label"; // Removed unused import
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
const MISSING_BASELINE_PREFIX = '__missing_remote_baseline__:';


// --- Interfaces and API Helpers ---
interface Repo { id: number; name: string; full_name: string; private: boolean; }
interface Branch { name: string; commit: { sha: string; url: string; }; protected: boolean; }
const GITHUB_API_BASE = "https://api.github.com";

async function fetchUserRepos(t: Function, pat: string): Promise<Repo[]> { // Add t parameter
    const response = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(t('app.fetchReposError', { status: response.status, message: errorData.message || '' }) as string); } // Add type assertion
    return response.json();
}
async function fetchRepoBranches(t: Function, pat: string, repoFullName: string): Promise<Branch[]> { // Add t parameter
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/branches`, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(t('app.fetchBranchesError', { status: response.status, message: errorData.message || '' }) as string); } // Add type assertion
    return response.json();
}

// Helper to get file content
async function getGithubFileContent(t: Function, pat: string, repoFullName: string, path: string, branch: string): Promise<string> { // Add t parameter
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}?ref=${branch}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `token ${pat}`,
            Accept: "application/vnd.github.v3+json",
        },
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(t('app.fetchFileContentError', { path: path, status: response.status, message: errorData.message || '' }) as string); // Add type assertion
    }
    const data = await response.json();
    if (data.encoding !== 'base64') {
        throw new Error(t('app.unknownEncodingError', { encoding: data.encoding }) as string); // Add type assertion
    }
    // Decode base64 content
    const decodedContent = decodeURIComponent(escape(atob(data.content)));
    return decodedContent;
}
// --- End API Helpers ---


function App() {
  const { t } = useTranslation();
  const navigate = useNavigate(); // 路由导航hook
  const location = useLocation(); // 当前路由位置hook
  
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
  const [openedFileContent, setOpenedFileContent] = useState<ExcalidrawSceneData | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [fileLoadingError, setFileLoadingError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null); // Store the path selected in the tree
  const [openedCommitSha, setOpenedCommitSha] = useState<string | null>(null); // Store the SHA if a specific version is opened
  const [openedFileOriginalSha, setOpenedFileOriginalSha] = useState<string | null>(null); // 存储文件的原始SHA，用于缓存
  const [openedFileBaselineSnapshot, setOpenedFileBaselineSnapshot] = useState<string | null>(null);

  const browserRef = useRef<GithubFileBrowserRef>(null);
  const excalidrawWrapperRef = useRef<ExcalidrawWrapperRef>(null); // Ref for ExcalidrawWrapper

  // State for tracking modified files
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());

  // State for Commit Dialog (triggered by Save menu or Save prompt)
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [filePathsToSave, setFilePathsToSave] = useState<string[]>([]);
  const [fileToOpenAfterCreate, setFileToOpenAfterCreate] = useState<string | null>(null); // State to trigger opening after creation
  const [showCacheManager, setShowCacheManager] = useState(false); // 缓存管理器状态

  // 路由同步状态
  const [isInitializing, setIsInitializing] = useState(true); // 标记是否正在初始化

  // 路由同步 - 从URL恢复状态
  useEffect(() => {
    if (!currentPat || isLoadingRepos || repos.length === 0) {
      return; // 等待PAT和仓库列表加载完成
    }

    const routeParams = parseRouteParams(location.pathname);
    console.log('[DEBUG] Route sync: parsing route params:', routeParams);

    // 如果URL中有仓库信息，尝试恢复状态
    if (routeParams.repo) {
      const repoExists = repos.some(repo => repo.full_name === routeParams.repo);
      if (repoExists && selectedRepo !== routeParams.repo) {
        console.log('[DEBUG] Route sync: setting repo from URL:', routeParams.repo);
        setSelectedRepo(routeParams.repo);
        return; // 等待分支加载
      }
    }

    // 如果URL中有分支信息，尝试恢复状态
    if (routeParams.branch && selectedRepo === routeParams.repo && branches.length > 0) {
      const branchExists = branches.some(branch => branch.name === routeParams.branch);
      if (branchExists && selectedBranch !== routeParams.branch) {
        console.log('[DEBUG] Route sync: setting branch from URL:', routeParams.branch);
        setSelectedBranch(routeParams.branch);
        return; // 等待文件加载
      }
    }

    // 如果URL中有文件信息，尝试打开文件
    if (routeParams.filePath && 
        selectedRepo === routeParams.repo && 
        selectedBranch === routeParams.branch &&
        openedFilePath !== routeParams.filePath &&
        !isFileLoading) {
      console.log('[DEBUG] Route sync: opening file from URL:', routeParams.filePath);
      handleFileNodeClick(routeParams.filePath);
    }

    setIsInitializing(false);
  }, [location.pathname, currentPat, repos, selectedRepo, branches, selectedBranch, openedFilePath, isLoadingRepos, isFileLoading]);

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
                const fetchedRepos = await fetchUserRepos(t, currentPat); // Pass t
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
            try { const fetchedBranches = await fetchRepoBranches(t, currentPat, selectedRepo); setBranches(fetchedBranches); if (fetchedBranches.length > 0) { const main = fetchedBranches.find(b => b.name === 'main'); const master = fetchedBranches.find(b => b.name === 'master'); if (main) setSelectedBranch(main.name); else if (master) setSelectedBranch(master.name); else setSelectedBranch(fetchedBranches[0].name); } else { setSelectedBranch(null); } } // Pass t
            catch (err: any) { setRepoBranchError(err.message || t('app.loadingErrorTitle')); }
            finally { setIsLoadingBranches(false); }
        }
        loadBranches();
    }, [currentPat, selectedRepo, t]);

   const handlePatSaved = (newPat: string) => { setCurrentPat(newPat); setShowSettingsDialog(false); };
   const handlePatCleared = () => {
        setCurrentPat(null);
        setRepos([]);
        setSelectedRepo(null);
        setBranches([]);
        setSelectedBranch(null);
        setRepoBranchError(null);
        setSelectedFilePath(null);
        setOpenedFilePath(null);
        setOpenedFileContent(null);
        setOpenedCommitSha(null);
        setOpenedFileOriginalSha(null);
        setOpenedFileBaselineSnapshot(null);
        setModifiedFiles(new Set());
        setShowSettingsDialog(false);
   };
   const handleRepoChange = (repoFullName: string) => {
        setSelectedRepo(repoFullName);
        setSelectedFilePath(null); // 新增：切换仓库时清除选中文件
        setOpenedFilePath(null);
        setOpenedFileContent(null);
        setOpenedCommitSha(null);
        setOpenedFileOriginalSha(null); // 清除原始SHA
        setOpenedFileBaselineSnapshot(null);
        
        // 更新URL路由
        if (!isInitializing) {
          navigate(buildRepoRoute(repoFullName));
        }
        
        // Save the selected repo to localStorage
        try {
            localStorage.setItem(LOCALSTORAGE_KEY_PREFERRED_REPO, repoFullName);
        } catch (error) {
            console.error("Error saving preferred repo to localStorage:", error);
        }
    };
   const handleBranchChange = (branchName: string) => { 
        setSelectedBranch(branchName); 
        setSelectedFilePath(null); 
        setOpenedFilePath(null); 
        setOpenedFileContent(null); 
        setOpenedCommitSha(null);
        setOpenedFileOriginalSha(null); // 清除原始SHA
        setOpenedFileBaselineSnapshot(null);
        
        // 更新URL路由
        if (!isInitializing && selectedRepo) {
          navigate(buildRepoRoute(selectedRepo, branchName));
        }
    }; // 新增：切换分支时清除选中文件
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
            setCreateFileError(error.message || t('createFileDialog.apiError', { filePath: trimmedPath, error: t('app.unknownError') }));
        } finally {
            setIsCreatingFile(false); // Correctly placed finally block
        }
    };

  // --- Effect to open file after creation ---
  useEffect(() => {
      if (fileToOpenAfterCreate && !isFileLoading) { // Ensure not already loading
          console.log(`[DEBUG] App: useEffect triggered to open file: ${fileToOpenAfterCreate}`);
          // Call handleFileNodeClick to load the newly created file (latest version)
          handleFileNodeClick(fileToOpenAfterCreate);
          setFileToOpenAfterCreate(null); // Reset the trigger state
      }
  }, [fileToOpenAfterCreate, isFileLoading]); // Add isFileLoading dependency

  const refreshModifiedFilesFromCache = useCallback(async (repoFullName?: string | null, branchName?: string | null) => {
      if (!repoFullName || !branchName) {
          setModifiedFiles(new Set());
          return;
      }

      try {
          const cachedFiles = await getAllCachedFiles(repoFullName, branchName);
          setModifiedFiles(new Set(cachedFiles.map(file => file.filePath)));
      } catch (error) {
          console.error('[DEBUG] App: Failed to refresh modified files from cache:', error);
      }
  }, []);

  useEffect(() => {
      refreshModifiedFilesFromCache(selectedRepo, selectedBranch);
  }, [selectedRepo, selectedBranch, refreshModifiedFilesFromCache]);

  // --- Handler for file node click ---
  const parseExcalidrawContent = (rawContent: string, filePath: string): ExcalidrawSceneData => {
      try {
          const parsedData = JSON.parse(rawContent);
          const hasSceneShape = parsedData && typeof parsedData === 'object' && (
              Array.isArray(parsedData.elements) ||
              typeof parsedData.elements === 'object' ||
              typeof parsedData.elements === 'undefined'
          );

          if (!hasSceneShape) {
              console.warn("Parsed data structure might be invalid:", parsedData);
              throw new Error(t('app.invalidExcalidrawFormat'));
          }

          return normalizeSceneData(parsedData);
      } catch (parseError: any) {
          console.error("Failed to parse Excalidraw content:", parseError);
          throw new Error(t('app.parseExcalidrawError', { filePath: filePath, message: parseError.message }));
      }
  };

  // Function to load the *latest* file content from GitHub
  const loadLatestFileContent = async (filePathToLoad: string) => {
      if (!currentPat || !selectedRepo || !selectedBranch) return;
      const pat = currentPat;
      const repoFullName = selectedRepo;
      const branchName = selectedBranch;

      console.log("Opening latest Excalidraw file:", filePathToLoad);
      setIsFileLoading(true);
      setFileLoadingError(null);
      setSelectedFilePath(filePathToLoad); // Highlight the selected file in the tree
      setOpenedFilePath(filePathToLoad);   // Mark it as the currently opened file
      setOpenedCommitSha(null);            // Explicitly mark as latest version
      setOpenedFileContent(null);          // Clear previous content while loading
      setOpenedFileOriginalSha(null);     // 清除原始SHA
      setOpenedFileBaselineSnapshot(null);

      try {
          // 首先尝试从缓存加载
          const cachedFile = await getCachedFile(repoFullName, branchName, filePathToLoad);
          
          if (cachedFile) {
              console.log(`[DEBUG] App: Found cached content for ${filePathToLoad}, using cache`);
              const normalizedCachedScene = normalizeSceneData(cachedFile.content);
              let baselineSnapshot = cachedFile.baseSnapshot;

              if (!baselineSnapshot) {
                  console.log(`[DEBUG] App: Cache for ${filePathToLoad} is missing baseline, fetching remote baseline`);
                  try {
                      const rawContent = await getGithubFileContent(t, pat, repoFullName, filePathToLoad, branchName);
                      const remoteScene = parseExcalidrawContent(rawContent, filePathToLoad);
                      baselineSnapshot = createSceneSnapshot(remoteScene);
                      await saveCachedFile({
                          ...cachedFile,
                          content: normalizedCachedScene,
                          baseSnapshot: baselineSnapshot,
                      });
                  } catch (baselineError) {
                      console.warn(`[DEBUG] App: Failed to recover remote baseline for ${filePathToLoad}:`, baselineError);
                      baselineSnapshot = `${MISSING_BASELINE_PREFIX}${repoFullName}:${branchName}:${filePathToLoad}`;
                  }
              }

              setOpenedFileContent(normalizedCachedScene);
              setOpenedFileOriginalSha(cachedFile.originalSha || null);
              setOpenedFileBaselineSnapshot(baselineSnapshot);
              
              // 标记为已修改（因为有缓存说明用户做过修改）
              setModifiedFiles(prev => {
                  const newSet = new Set(prev);
                  newSet.add(filePathToLoad);
                  console.log(`[DEBUG] App: Marked cached file as modified: ${filePathToLoad}`);
                  return newSet;
              });
          } else {
              // 缓存中没有，从GitHub加载
              console.log(`[DEBUG] App: No cache found for ${filePathToLoad}, loading from GitHub`);
              const rawContent = await getGithubFileContent(t, pat, repoFullName, filePathToLoad, branchName); // Pass t
              const remoteScene = parseExcalidrawContent(rawContent, filePathToLoad);
              setOpenedFileContent(remoteScene);
              setOpenedFileBaselineSnapshot(createSceneSnapshot(remoteScene));

              setModifiedFiles(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(filePathToLoad);
                  return newSet;
              });
              // 获取文件的SHA（这里需要额外的API调用来获取文件信息）
              // 为了简化，我们暂时不获取SHA，在实际使用中可以通过文件树组件传递
          }
          
          // 更新URL路由
          if (!isInitializing) {
            navigate(buildFileRoute(repoFullName, branchName, filePathToLoad));
          }
      } catch (error: any) {
          console.error("Failed to load latest file content:", error);
          setFileLoadingError(error.message);
          setOpenedFilePath(null); // Clear opened file path on error
          setOpenedFileContent(null);
          setOpenedCommitSha(null);
          setOpenedFileOriginalSha(null);
          setOpenedFileBaselineSnapshot(null);
          // Keep selectedFilePath so user knows which file failed
      } finally {
          setIsFileLoading(false);
      }
  };

  // --- Handler for file node click (handles both latest and specific versions) ---
  const handleFileNodeClick = (filePath: string, content?: string, commitSha?: string) => {
      console.log(`handleFileNodeClick: path=${filePath}, sha=${commitSha ?? 'latest'}, hasContent=${!!content}`);

      // Prevent action if already loading
      if (isFileLoading) {
          console.log("Ignoring click, file is loading.");
          return;
      }

      // Prevent action if the exact same file path and version is already open
      if (filePath === openedFilePath && commitSha === openedCommitSha) {
           console.log("Ignoring click, same file and version already open.");
          return;
      }

      // Handle non-excalidraw files (just select, don't open/prompt)
      if (!filePath.toLowerCase().endsWith('.excalidraw')) {
          console.log("Clicked non-excalidraw file:", filePath);
          setSelectedFilePath(filePath); // Select in tree
          // Decide if you want to clear the editor or keep the previous file visible
          // setOpenedFilePath(null);
          // setOpenedFileContent(null);
          // setOpenedCommitSha(null);
          return;
      }

      // Always switch directly, even if current file has unsaved changes.
      // Unsaved content is preserved by cache + modifiedFiles markers.
      if (commitSha && content) {
          // Load specific version using provided content
          console.log(`Loading specific version ${commitSha.substring(0,7)} for ${filePath}`);
          setIsFileLoading(true); // Set loading state briefly for UI feedback
          setFileLoadingError(null);
          setSelectedFilePath(filePath); // Select in tree
          setOpenedFilePath(filePath);   // Set opened file path
          setOpenedCommitSha(commitSha); // Set opened commit SHA
          setOpenedFileOriginalSha(null);
          try {
              const versionScene = parseExcalidrawContent(content, filePath);
              setOpenedFileContent(versionScene);
              setOpenedFileBaselineSnapshot(createSceneSnapshot(versionScene));
          } catch (error: any) {
              console.error("Failed to parse provided file content:", error);
              setFileLoadingError(error.message);
              setOpenedFilePath(null);
              setOpenedFileContent(null);
              setOpenedCommitSha(null);
              setOpenedFileOriginalSha(null);
              setOpenedFileBaselineSnapshot(null);
          } finally {
              setIsFileLoading(false);
          }
          
          // 更新URL路由（仅对.excalidraw文件）
          if (!isInitializing && selectedRepo && selectedBranch && filePath.toLowerCase().endsWith('.excalidraw')) {
            navigate(buildFileRoute(selectedRepo, selectedBranch, filePath));
          }
      } else {
          // Load the latest version using API call
          loadLatestFileContent(filePath);
          
          // 更新URL路由（仅对.excalidraw文件）
          if (!isInitializing && selectedRepo && selectedBranch && filePath.toLowerCase().endsWith('.excalidraw')) {
            navigate(buildFileRoute(selectedRepo, selectedBranch, filePath));
          }
      }
  };

  // --- Handler to trigger the commit dialog ---
  const handleSaveRequest = (filePathToSave: string) => {
      console.log(`%c[DEBUG] App: handleSaveRequest TRIGGERED for: ${filePathToSave}`, 'color: blue; font-weight: bold;');
      console.log(`Save requested for: ${filePathToSave}`);
      setFilePathsToSave([filePathToSave]);
      setShowSaveDialog(true);
  };

  const handleBulkSaveRequest = useCallback(() => {
      const targetFilePaths = Array.from(modifiedFiles).sort();
      if (targetFilePaths.length === 0) {
          return;
      }

      console.log(`%c[DEBUG] App: handleBulkSaveRequest TRIGGERED for: ${targetFilePaths.join(', ')}`, 'color: blue; font-weight: bold;');
      setFilePathsToSave(targetFilePaths);
      setShowSaveDialog(true);
  }, [modifiedFiles]);

  const getCurrentExcalidrawContent = useCallback((): ExcalidrawSceneData | null => {
      if (excalidrawWrapperRef.current) {
          return {
              elements: excalidrawWrapperRef.current.getSceneElements(),
              appState: excalidrawWrapperRef.current.getAppState(),
              files: excalidrawWrapperRef.current.getFiles(),
          };
      }
      console.error("Excalidraw ref not available to get content.");
      return null;
  }, []);

  const getLatestContentForSave = useCallback(async (targetFilePath: string | null): Promise<ExcalidrawSceneData | null> => {
      if (!targetFilePath || !selectedRepo || !selectedBranch) {
          return null;
      }

      if (targetFilePath === openedFilePath) {
          return getCurrentExcalidrawContent();
      }

      const cachedFile = await getCachedFile(selectedRepo, selectedBranch, targetFilePath);
      return cachedFile ? normalizeSceneData(cachedFile.content) : null;
  }, [selectedRepo, selectedBranch, openedFilePath, getCurrentExcalidrawContent]);

  // --- Callbacks for SaveFileDialog ---
  const handleSaveSuccess = (savedFilePaths: string[], newShasByPath: Record<string, string>) => {
      console.log(`%c[DEBUG] App: handleSaveSuccess CALLED for ${savedFilePaths.join(', ')}`, 'color: green; font-weight: bold;');
      console.log(`[DEBUG] App: handleSaveSuccess called for ${savedFilePaths.join(', ')} with SHAs`, newShasByPath);
      setShowSaveDialog(false);
      setFilePathsToSave([]);
      // Remove modification flag
      setModifiedFiles(prev => {
          const newSet = new Set(prev);
          savedFilePaths.forEach((savedFilePath) => {
              newSet.delete(savedFilePath);
              console.log(`[DEBUG] App: Removed modification flag for: ${savedFilePath}`);
          });
          return newSet;
      });

      if (selectedRepo && selectedBranch) {
          savedFilePaths.forEach((savedFilePath) => {
              deleteCachedFile(selectedRepo, selectedBranch, savedFilePath).catch(error => {
                  console.error(`[DEBUG] App: Failed to clear draft cache for ${savedFilePath} after save:`, error);
              });
          });
      }

      if (openedFilePath && savedFilePaths.includes(openedFilePath)) {
          const latestContent = getCurrentExcalidrawContent();
          if (latestContent) {
              setOpenedFileBaselineSnapshot(createSceneSnapshot(latestContent));
              setOpenedCommitSha(null);
              setOpenedFileOriginalSha(newShasByPath[openedFilePath] ?? null);
          } else {
              console.warn("[DEBUG] App: Could not update editor baseline after save (missing editor ref).");
          }
      }

      // Force refresh the file tree to get the latest SHAs from GitHub
      console.log("[DEBUG] App: Refreshing file tree after successful save.");
      browserRef.current?.refreshTree(); // Ensure this line is active
  };

  const handleSaveCancel = () => {
      setShowSaveDialog(false);
      setFilePathsToSave([]);
      console.log("Save cancelled.");
  };

  const handleSaveError = (error: Error) => {
      // Error is already logged in SaveFileDialog, maybe show a toast or alert here
      console.error("Save failed in App:", error.message);
      // Keep the dialog open for the user to see the error message within it
      // Optionally, display a more user-friendly message in App's UI
      // setAppLevelError(`Failed to save file: ${error.message}`);
  };

  // --- Handler for Excalidraw content change ---
  const handleExcalidrawChange = useCallback((
      _elements: readonly any[],
      _appState: any,
      _files: any,
      isModified: boolean // This indicates if content differs from the *initial* state loaded into Excalidraw
  ) => {
      // Modification status is tracked against the openedFilePath (without SHA)
      // because saving always updates the latest version.
      console.log(`[DEBUG] App: handleExcalidrawChange called for ${openedFilePath} (version: ${openedCommitSha ?? 'latest'}) with isModified: ${isModified}`);
      if (openedFilePath) {
          setModifiedFiles(prev => {
              const newSet = new Set(prev);
              const currentlyMarked = newSet.has(openedFilePath); // Check based on path only

              if (isModified) {
                  if (!currentlyMarked) {
                      console.log(`[DEBUG] App: Marking file as modified: ${openedFilePath}`);
                      newSet.add(openedFilePath);
                      return newSet; // Return new set
                  }
              } else {
                  if (currentlyMarked) {
                      console.log(`[DEBUG] App: Marking file as unmodified: ${openedFilePath}`);
                      newSet.delete(openedFilePath);
                      return newSet; // Return new set
                  }
              }
              return prev; // Return previous state if no change in modification status
          });
      }
  }, [openedFilePath, openedCommitSha]); // Depend on both path and SHA to re-evaluate if needed, though logic uses path only for the Set key.

  // 恢复缓存文件的处理函数
  const handleRestoreCachedFile = (file: CachedFileData) => {
    console.log(`[DEBUG] App: Restoring cached file: ${file.filePath}`);
    
    // 设置文件状态
    setSelectedFilePath(file.filePath);
    setOpenedFilePath(file.filePath);
    setOpenedFileContent(normalizeSceneData(file.content));
    setOpenedCommitSha(null); // 缓存的文件是基于最新版本的
    setOpenedFileOriginalSha(file.originalSha || null);
    setOpenedFileBaselineSnapshot(file.baseSnapshot || `${MISSING_BASELINE_PREFIX}${file.repoFullName}:${file.branch}:${file.filePath}`);
    
    // 标记为已修改
    setModifiedFiles(prev => {
      const newSet = new Set(prev);
      newSet.add(file.filePath);
      console.log(`[DEBUG] App: Marked restored file as modified: ${file.filePath}`);
      return newSet;
    });
    
    // 更新URL路由
    if (!isInitializing && selectedRepo && selectedBranch) {
      navigate(buildFileRoute(selectedRepo, selectedBranch, file.filePath));
    }
  };

  const handleCacheChanged = useCallback(() => {
    refreshModifiedFilesFromCache(selectedRepo, selectedBranch);
  }, [selectedRepo, selectedBranch, refreshModifiedFilesFromCache]);

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
              <Button 
                variant="outline" 
                size="icon" 
                title="缓存管理器"
                onClick={() => setShowCacheManager(true)}
              >
                <Database className="h-4 w-4" />
              </Button>
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
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedBranch || modifiedFiles.size === 0}
              title={t('app.bulkSaveButtonTitle')}
              onClick={handleBulkSaveRequest}
            >
              <Save className="mr-2 h-4 w-4" />
              {t('app.bulkSaveButtonLabel')}
            </Button>
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
                {t('app.loadingFile')}
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
                // Change key when file path OR commit SHA changes to force re-render
                key={`${openedFilePath}-${openedCommitSha ?? 'latest'}`}
                ref={excalidrawWrapperRef} // Assign ref
                initialData={openedFileContent}
                onChange={handleExcalidrawChange} // Pass the change handler
                baselineSnapshot={openedFileBaselineSnapshot}
                // 传递缓存相关的props
                filePath={openedFilePath}
                repoFullName={selectedRepo || undefined}
                branch={selectedBranch || undefined}
                originalSha={openedFileOriginalSha || undefined}
                // Optionally pass commit SHA to display in UI (needs ExcalidrawWrapper modification)
                // loadedCommitSha={openedCommitSha}
            />
        ) : (
            <div className="flex-grow flex items-center justify-center text-muted-foreground">
                {t('app.selectFilePrompt')}
            </div>
        )}
      </Panel>
    </PanelGroup>

    {/* Save File Dialog (Commit Message) */}
    <SaveFileDialog
      isOpen={showSaveDialog}
      onOpenChange={setShowSaveDialog}
      filePathsToSave={filePathsToSave}
      pat={currentPat}
      repoFullName={selectedRepo}
      branchName={selectedBranch}
      getLatestContent={getLatestContentForSave}
      onSaveSuccess={handleSaveSuccess} // Updated signature is compatible
      onSaveCancel={handleSaveCancel}
      onSaveError={handleSaveError}
    />

    {/* 缓存管理器对话框 */}
    <CacheManager
      isOpen={showCacheManager}
      onOpenChange={setShowCacheManager}
      currentRepo={selectedRepo || undefined}
      currentBranch={selectedBranch || undefined}
      onRestoreFile={handleRestoreCachedFile}
      onCacheChanged={handleCacheChanged}
    />

  </>); // Wrap in fragment
}

export default App;
