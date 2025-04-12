// vite-project/src/components/GithubFileTree.tsx
import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next'; // Import useTranslation
import { Loader2, File, Folder, ChevronDown, ChevronRight, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

// --- Interfaces ---
interface FileSystemNode {
  type: 'file' | 'directory';
  name: string;
  path: string;
  sha?: string;
  children?: FileSystemNode[];
}

// --- GitHub API Base URL ---
const GITHUB_API_BASE = "https://api.github.com";

// --- API Helper Functions ---

// Fetch recursive file tree
async function fetchFileTree(pat: string, repoFullName: string, branchName: string): Promise<FileSystemNode[]> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees/${branchName}?recursive=1`;
    const response = await fetch(url, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`获取文件树失败: ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
    }
    const data = await response.json();
    if (!data.tree) {
        console.warn("Received empty or invalid tree data from GitHub API for", repoFullName, branchName);
        return []; // Return empty array if tree is missing
    }
    const treeData: FileSystemNode[] = data.tree.map((item: any) => ({
        type: item.type === 'tree' ? 'directory' : 'file',
        name: item.path.split('/').pop() || item.path, // Handle potential empty name after split
        path: item.path,
        sha: item.sha,
    }));

    // Build hierarchical structure
    function buildTree(nodes: FileSystemNode[]): FileSystemNode[] {
        const root: FileSystemNode[] = [];
        const nodeMap: { [path: string]: FileSystemNode } = {};
        // Sort nodes by path length first to ensure parents are processed before children
        nodes.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

        nodes.forEach(node => {
            nodeMap[node.path] = node; // Add node to map
            const pathParts = node.path.split('/');
            if (pathParts.length === 1) {
                root.push(node); // Root level node
            } else {
                const parentPath = pathParts.slice(0, -1).join('/');
                const parent = nodeMap[parentPath];
                if (parent && parent.type === 'directory') { // Ensure parent is a directory
                    parent.children = parent.children || [];
                    parent.children.push(node);
                } else {
                    // If parent not found or not a directory (unexpected for recursive tree), add to root
                    console.warn("Parent node not found or not a directory for:", node.path, "Parent path:", parentPath);
                    root.push(node);
                }
            }
        });

        // Sort children within each directory
        const sortNodes = (nodesToSort: FileSystemNode[]) => {
            nodesToSort.sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory') return -1;
                if (a.type !== 'directory' && b.type === 'directory') return 1;
                return a.name.localeCompare(b.name);
            });
            nodesToSort.forEach(node => {
                if (node.children) sortNodes(node.children);
            });
        };
        sortNodes(root);
        return root;
    }
    return buildTree(treeData);
}

// Get file SHA using Contents API
async function getFileSha(pat: string, repoFullName: string, path: string, branch: string): Promise<string | null> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}?ref=${branch}`;
    try {
        const response = await fetch(url, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
        if (!response.ok) {
            if (response.status === 404) return null;
            console.error(`Failed to get SHA for ${path}: ${response.status}`);
            return null;
        }
        const data = await response.json();
        return data.sha;
    } catch (error) {
        console.error(`Error fetching SHA for ${path}:`, error);
        return null;
    }
}

// Delete a file using Contents API
async function deleteGithubFile(pat: string, repoFullName: string, path: string, sha: string, branch: string, commitMessage: string): Promise<void> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}`;
    const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", 'Content-Type': 'application/json' }, body: JSON.stringify({ message: commitMessage, sha: sha, branch: branch }) });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`删除文件失败: ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
    }
    console.log(`File ${path} deleted successfully.`);
}

// Create a new file using Contents API
async function createGithubFile(pat: string, repoFullName: string, path: string, content: string, branch: string, commitMessage: string): Promise<void> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}`;
    const encodedContent = btoa(unescape(encodeURIComponent(content)));
    const response = await fetch(url, { method: 'PUT', headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", 'Content-Type': 'application/json' }, body: JSON.stringify({ message: commitMessage, content: encodedContent, branch: branch }) });
    if (!response.ok && response.status !== 201) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`创建文件失败: ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
    }
    console.log(`File ${path} created successfully.`);
}

// Get Reference (Branch) Info
async function getRef(pat: string, repoFullName: string, branch: string): Promise<{ object: { sha: string } }> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/refs/heads/${branch}`;
    const response = await fetch(url, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) throw new Error(`获取分支引用失败: ${response.status}`);
    return response.json();
}

// Get Commit Info
async function getCommit(pat: string, repoFullName: string, commitSha: string): Promise<{ tree: { sha: string } }> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/commits/${commitSha}`;
    const response = await fetch(url, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) throw new Error(`获取 Commit 失败: ${response.status}`);
    return response.json();
}

// Get Tree Info (needed for file mode)
async function getTree(pat: string, repoFullName: string, treeSha: string): Promise<{ tree: Array<{ path: string; mode: string; type: string; sha: string }> }> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees/${treeSha}`;
    const response = await fetch(url, { headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" } });
    if (!response.ok) throw new Error(`获取 Tree 失败: ${response.status}`);
    return response.json();
}

// Create a new Tree
async function createTree(pat: string, repoFullName: string, baseTreeSha: string, treeNodes: Array<{ path: string; mode: string; type: string; sha: string | null }>): Promise<{ sha: string }> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/trees`;
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", 'Content-Type': 'application/json' }, body: JSON.stringify({ base_tree: baseTreeSha, tree: treeNodes }) });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`创建 Tree 失败: ${response.status} - ${errorData.message}`); }
    return response.json();
}

// Create a new Commit
async function createCommit(pat: string, repoFullName: string, message: string, treeSha: string, parentCommitSha: string): Promise<{ sha: string }> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/commits`;
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", 'Content-Type': 'application/json' }, body: JSON.stringify({ message, tree: treeSha, parents: [parentCommitSha] }) });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`创建 Commit 失败: ${response.status} - ${errorData.message}`); }
    return response.json();
}

// Update Reference (Branch)
async function updateRef(pat: string, repoFullName: string, branch: string, commitSha: string): Promise<void> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/git/refs/heads/${branch}`;
    const response = await fetch(url, { method: 'PATCH', headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: commitSha }) });
    if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`更新分支引用失败: ${response.status} - ${errorData.message}`); }
}
// --- End Helper Functions ---


// --- TreeNode Component ---
interface TreeNodeProps {
  node: FileSystemNode;
  level: number;
  repoFullName: string;
  branchName: string;
  onRenameRequest: (oldPath: string, newName: string) => Promise<void>;
  onDeleteRequest: (path: string, type: 'file' | 'directory') => Promise<void>;
  onApiError: (message: string) => void;
  onFileNodeClick: (filePath: string) => void;
}

function TreeNode({ node, level, repoFullName, branchName, onRenameRequest, onDeleteRequest, onApiError, onFileNodeClick }: TreeNodeProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenamingApiCall, setIsRenamingApiCall] = useState(false);
  const [hovered, setHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showFolderInstructionDialog, setShowFolderInstructionDialog] = useState(false);
  const [folderInstructionType, setFolderInstructionType] = useState<'rename' | 'delete' | null>(null);

  const hasChildren = node.children && node.children.length > 0;

  const toggle = useCallback(() => {
    if (hasChildren) setIsOpen(!isOpen);
  }, [hasChildren, isOpen]);

  const handleRenameClick = () => {
    if (node.type === 'directory') {
      setFolderInstructionType('rename');
      setShowFolderInstructionDialog(true);
    } else {
      setIsRenaming(true);
      setNewName(node.name);
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  };

  const handleRenameSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmedNewName = newName.trim();
    if (!trimmedNewName || trimmedNewName === node.name || node.type === 'directory') {
      setIsRenaming(false);
      return;
    }
    setIsRenamingApiCall(true);
    onApiError("");
    try {
      await onRenameRequest(node.path, trimmedNewName);
      setIsRenaming(false);
    } catch (error: any) {
      console.error("Rename failed:", error);
      onApiError(t('fileTree.renameError', { fileName: node.name, error: error.message }));
      setIsRenaming(false);
      setNewName(node.name);
    } finally {
      setIsRenamingApiCall(false);
    }
  };

  const handleDeleteClick = () => {
    if (node.type === 'directory') {
      setFolderInstructionType('delete');
      setShowFolderInstructionDialog(true);
    } else {
      setShowDeleteDialog(true);
    }
  };

  const confirmDelete = async () => {
    if (node.type === 'directory') return;
    setIsDeleting(true);
    onApiError("");
    try {
      await onDeleteRequest(node.path, node.type);
      setShowDeleteDialog(false);
    } catch (error: any) {
      console.error("Delete failed:", error);
      onApiError(t('fileTree.deleteError', { fileName: node.name, error: error.message }));
      setShowDeleteDialog(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNodeClick = () => {
      if (node.type === 'file') {
          onFileNodeClick(node.path);
      } else {
          toggle(); // Toggle folder on click
      }
  };

  const repoUrl = `https://github.com/${repoFullName}.git`;
  const repoDirName = repoFullName.split('/')[1] || '<仓库目录>';

  return (
    <div>
      <div
        className={cn(
          "flex items-center space-x-1 py-1.5 px-2 rounded-md hover:bg-secondary hover:text-secondary-foreground",
          isRenaming ? "bg-secondary" : ""
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
         <span onClick={toggle} className="cursor-pointer p-1 -ml-1">
          {hasChildren ? (
            isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <div className="w-4 h-4 shrink-0" />
          )}
        </span>
        {node.type === 'directory' ? <Folder className="h-4 w-4 shrink-0 text-sky-500" /> : <File className="h-4 w-4 shrink-0 text-gray-500" />}
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} className="flex-grow">
            <Input ref={renameInputRef} value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => handleRenameSubmit()} className="h-6 px-1 text-sm" disabled={isRenamingApiCall} autoFocus />
             {isRenamingApiCall && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
          </form>
        ) : (
          <span
              className="flex-grow truncate cursor-pointer"
              onClick={handleNodeClick}
              onDoubleClick={handleRenameClick}
          >
            {node.name}
          </span>
        )}
        {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={cn("h-6 w-6 opacity-0", hovered && "opacity-100", "focus:opacity-100")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleRenameClick}>
                <Edit className="mr-2 h-4 w-4" />
                {t('fileTree.renameAction')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeleteClick} className={cn(node.type === 'directory' ? "" : "text-red-600 focus:text-red-600 focus:bg-red-50")}>
                <Trash2 className="mr-2 h-4 w-4" />
                 {t('fileTree.deleteAction')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path} node={child} level={level + 1}
              repoFullName={repoFullName}
              branchName={branchName}
              onRenameRequest={onRenameRequest}
              onDeleteRequest={onDeleteRequest}
              onApiError={onApiError}
              onFileNodeClick={onFileNodeClick} // Pass down
            />
          ))}
        </div>
      )}

       <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
         <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('fileTree.deleteFileConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('fileTree.deleteFileConfirmDesc', { fileName: node.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>{t('fileTree.cancelButton')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? t('fileTree.deletingButton') : t('fileTree.deleteButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFolderInstructionDialog} onOpenChange={setShowFolderInstructionDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {folderInstructionType === 'rename' ? t('fileTree.folderInstructionTitleRename') : t('fileTree.folderInstructionTitleDelete')}
            </DialogTitle>
            <DialogDescription>
              {folderInstructionType === 'rename'
                ? t('fileTree.folderInstructionDescRename')
                : t('fileTree.folderInstructionDescDelete')}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 bg-muted p-4 rounded-md text-sm font-mono overflow-x-auto">
            <pre><code>
              {folderInstructionType === 'rename'
                ? `${t('fileTree.gitClone')}\n` +
                  `git clone ${repoUrl}\n` +
                  `cd ${repoDirName}\n\n` +
                  `${t('fileTree.gitCheckout')}\n` +
                  `git checkout ${branchName}\n\n` +
                  `${t('fileTree.gitMv')}\n` +
                  `git mv "${node.path}" "${node.path.substring(0, node.path.lastIndexOf('/') + 1)}新名称"\n\n`+
                  `${t('fileTree.gitCommitRename')}\n` +
                  `git commit -m "feat: rename folder ${node.name} to 新名称"\n\n` +
                  `${t('fileTree.gitPush')}\n` +
                  `git push origin ${branchName}`
                : `${t('fileTree.gitClone')}\n` +
                  `git clone ${repoUrl}\n` +
                  `cd ${repoDirName}\n\n` +
                  `${t('fileTree.gitCheckout')}\n` +
                  `git checkout ${branchName}\n\n` +
                  `${t('fileTree.gitRm')}\n` +
                  `git rm -r "${node.path}"\n\n` +
                  `${t('fileTree.gitCommitDelete')}\n` +
                  `git commit -m "feat: remove folder ${node.name}"\n\n` +
                  `${t('fileTree.gitPush')}\n` +
                  `git push origin ${branchName}`
              }
            </code></pre>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t('patInput.closeButton')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// --- GithubFileTree Component ---
interface GithubFileTreeProps {
  pat: string;
  repoFullName: string;
  branchName: string;
  onFileNodeClick: (filePath: string) => void; // Add prop
}

export interface GithubFileTreeRef {
  refreshTree: () => void;
  createFile: (filePath: string) => Promise<void>;
}

export const GithubFileTree = forwardRef<GithubFileTreeRef, GithubFileTreeProps>(
  ({ pat, repoFullName, branchName, onFileNodeClick }, ref) => { // Add prop
    const { t } = useTranslation(); // Initialize hook in the main component too
    const [fileTree, setFileTree] = useState<FileSystemNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);

    const loadFileTree = useCallback(async () => {
      if (!pat || !repoFullName || !branchName) {
          setFileTree([]);
          setIsLoading(false);
          return;
      }
      setIsLoading(true);
      setError(null);
      setApiError(null);
      try {
        const fetchedFileTree = await fetchFileTree(pat, repoFullName, branchName);
        setFileTree(fetchedFileTree);
      } catch (error: any) {
        console.error("Failed to fetch file tree:", error);
        setError(error.message || t('app.loadingErrorTitle')); // Use t()
        setFileTree([]);
      } finally {
        setIsLoading(false);
      }
    }, [pat, repoFullName, branchName, t]); // Add t dependency

    useEffect(() => {
      loadFileTree();
    }, [loadFileTree]);

    useImperativeHandle(ref, () => ({
      refreshTree: () => {
        loadFileTree();
      },
      createFile: async (filePath: string) => {
        console.log(`API: Creating file ${filePath}`);
        setApiError(null);
        try {
          await createGithubFile(
            pat,
            repoFullName,
            filePath,
            "",
            branchName,
            `feat: create file ${filePath}`
          );
          await loadFileTree();
        } catch (error: any) {
          console.error("Create file API call failed:", error);
          setApiError(t('createFileDialog.apiError', { filePath: filePath, error: error.message })); // Use t()
          throw error;
        }
      }
    }));

    const updateTreeState = (updater: (currentTree: FileSystemNode[]) => FileSystemNode[]) => {
        setFileTree(currentTree => updater(currentTree));
    };

    const handleRenameNode = useCallback(async (oldPath: string, newName: string) => {
      console.log(`API: Renaming ${oldPath} to ${newName}`);
      setApiError(null);

      let fileToRenameDetails: { sha: string | undefined; mode: string } | null = null;
      const findNode = (nodes: FileSystemNode[], targetPath: string): { sha: string | undefined; mode: string } | null => {
          for (const node of nodes) {
              if (node.path === targetPath) return { sha: node.sha, mode: '100644' };
              if (node.children) {
                  const found = findNode(node.children, targetPath);
                  if (found) return found;
              }
          }
          return null;
      };
      fileToRenameDetails = findNode(fileTree, oldPath);

      if (!fileToRenameDetails || !fileToRenameDetails.sha) {
           throw new Error(t('fileTree.findNodeError', { path: oldPath })); // Use t()
      }

      try {
          const refData = await getRef(pat, repoFullName, branchName);
          const latestCommitSha = refData.object.sha;
          const commitData = await getCommit(pat, repoFullName, latestCommitSha);
          const baseTreeSha = commitData.tree.sha;

          const newPath = [...oldPath.split('/').slice(0, -1), newName].join('/');
          const treeUpdatePayload = [
              { path: oldPath, mode: fileToRenameDetails.mode, type: 'blob', sha: null },
              { path: newPath, mode: fileToRenameDetails.mode, type: 'blob', sha: fileToRenameDetails.sha }
          ];

          const newTree = await createTree(pat, repoFullName, baseTreeSha, treeUpdatePayload);
          const commitMessage = `feat: rename ${oldPath.split('/').pop()} to ${newName}`;
          const newCommit = await createCommit(pat, repoFullName, commitMessage, newTree.sha, latestCommitSha);
          await updateRef(pat, repoFullName, branchName, newCommit.sha);

          console.log(`File ${oldPath} renamed to ${newPath} successfully via API.`);

          updateTreeState(currentTree => {
              const updateNodeRecursively = (nodes: FileSystemNode[]): FileSystemNode[] => {
                  return nodes.map(node => {
                      if (node.path === oldPath) {
                          return { ...node, name: newName, path: newPath };
                      }
                      if (node.children) {
                          return { ...node, children: updateNodeRecursively(node.children) };
                      }
                      return node;
                  });
              };
              return updateNodeRecursively(currentTree);
          });

      } catch (error: any) {
          console.error("Rename API call failed:", error);
          throw error;
      }
    }, [pat, repoFullName, branchName, fileTree, t]);

    const handleDeleteNode = useCallback(async (path: string, type: 'file' | 'directory') => {
      if (type === 'directory') {
          console.warn("Directory deletion requested, showing instructions.");
          return;
      }
      console.log(`API: Deleting file ${path}`);
      setApiError(null);

      try {
          const currentSha = await getFileSha(pat, repoFullName, path, branchName);
          if (!currentSha) throw new Error(t('fileTree.getShaError', { path: path })); // Use t()
          await deleteGithubFile(pat, repoFullName, path, currentSha, branchName, `chore: delete file ${path.split('/').pop()}`);

          console.log(`File ${path} deleted successfully via API.`);

          updateTreeState(currentTree => {
              const removeNodeRecursively = (nodes: FileSystemNode[]): FileSystemNode[] => {
                  return nodes.filter(node => node.path !== path).map(node => {
                      if (node.children) {
                          return { ...node, children: removeNodeRecursively(node.children) };
                      }
                      return node;
                  });
              };
              return removeNodeRecursively(currentTree);
          });

      } catch (error: any) {
          console.error("Delete API call failed:", error);
          throw error;
      }
    }, [pat, repoFullName, branchName, t]);

    return (
      <div className="p-2 border rounded-md bg-background text-sm h-full flex flex-col">
         {(error || apiError) && (
            <div className="flex-shrink-0 mb-2">
                {error && (
                    <Alert variant="destructive">
                    <AlertTitle>{t('app.loadingErrorTitle')}</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                {apiError && (
                    <Alert variant="destructive" className={error ? "mt-2" : ""}>
                    <AlertTitle>{t('app.operationErrorTitle')}</AlertTitle>
                    <AlertDescription>{apiError}</AlertDescription>
                    </Alert>
                )}
            </div>
         )}

        {isLoading ? (
          <div className="flex-grow flex items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('fileTree.loading')}
          </div>
        ) : fileTree.length === 0 && !error ? (
           <div className="flex-grow flex items-center justify-center text-muted-foreground">{t('fileTree.empty')}</div>
        ) : (
          <div className="flex-grow overflow-y-auto">
            {fileTree.map(node => (
              <TreeNode
                key={node.path} node={node} level={0}
                repoFullName={repoFullName}
                branchName={branchName}
                onRenameRequest={handleRenameNode}
                onDeleteRequest={handleDeleteNode}
                onApiError={setApiError}
                onFileNodeClick={onFileNodeClick} // Pass down
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

GithubFileTree.displayName = "GithubFileTree";