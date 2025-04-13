// vite-project/src/components/GithubFileTree.tsx
import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next'; // Import useTranslation
import { Loader2, File, Folder, ChevronDown, ChevronRight, MoreHorizontal, Edit, Trash2, Save, History } from 'lucide-react'; // Add History icon
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
  // DialogTrigger, // Removed unused import
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area"; // 用于版本列表滚动
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip
import { format, formatRelative, parseISO } from 'date-fns'; // Import date-fns functions
import { enUS, zhCN } from 'date-fns/locale'; // Import locales

// --- Interfaces ---
interface FileSystemNode {
  type: 'file' | 'directory';
  name: string;
  path: string;
  sha?: string;
  children?: FileSystemNode[];
}
interface CommitInfo {
  sha: string;
  commit: {
    author: { name: string; date: string };
    committer: { name: string; date: string };
    message: string;
  };
  html_url: string;
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
export async function getFileSha(pat: string, repoFullName: string, path: string, branch: string): Promise<string | null> { // Add export
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
// Create a new file using Contents API - Now returns file details including SHA
async function createGithubFile(
  pat: string,
  repoFullName: string,
  path: string,
  content: string,
  branch: string,
  commitMessage: string
): Promise<{ path: string; sha: string }> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}`;
    const encodedContent = btoa(unescape(encodeURIComponent(content)));
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `token ${pat}`,
            Accept: "application/vnd.github.v3+json",
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: commitMessage, content: encodedContent, branch: branch })
    });
    if (!response.ok || response.status !== 201) { // Expect 201 Created
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`创建文件失败: ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
    }
    const result = await response.json();
    console.log(`File ${path} created successfully. SHA: ${result.content.sha}`);
    return { path: result.content.path, sha: result.content.sha }; // Return path and SHA
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

// Removed unused getTree function (lines 192-197 deleted)

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

// Update/Create a file using Contents API (handles both create and update)
export async function updateGithubFile( // Add export
  pat: string,
  repoFullName: string,
  path: string,
  content: string,
  branch: string,
  commitMessage: string,
  sha?: string // Provide SHA for updates, omit for creates
): Promise<{ sha: string }> { // Return only the new SHA for simplicity
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${path}`;
    const encodedContent = btoa(unescape(encodeURIComponent(content)));
    const body: { message: string; content: string; branch: string; sha?: string } = {
        message: commitMessage,
        content: encodedContent,
        branch: branch,
    };
    if (sha) {
        body.sha = sha; // Add SHA only if updating an existing file
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `token ${pat}`,
            Accept: "application/vnd.github.v3+json",
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok && response.status !== 201) { // 201 is for creation, 200 for update
        const errorData = await response.json().catch(() => ({}));
        const action = sha ? '更新' : '创建';
        throw new Error(`${action}文件失败: ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
    }
    console.log(`File ${path} ${sha ? 'updated' : 'created'} successfully.`);
    const result = await response.json();
    return { sha: result.content.sha }; // Return only the new SHA
}

// Fetch file commit history
async function fetchFileCommits(
  pat: string,
  repoFullName: string,
  filePath: string,
  branchName: string,
  page: number = 1,
  perPage: number = 30
): Promise<CommitInfo[]> {
  const url = `${GITHUB_API_BASE}/repos/${repoFullName}/commits?path=${encodeURIComponent(filePath)}&sha=${branchName}&page=${page}&per_page=${perPage}`;
  const response = await fetch(url, {
    headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json" }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`获取文件提交历史失败: ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
  }
  return response.json();
}

// Fetch file content at a specific commit
async function fetchFileContentAtCommit(
    pat: string,
    repoFullName: string,
    filePath: string,
    commitSha: string
): Promise<string> {
    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/${filePath}?ref=${commitSha}`;
    const response = await fetch(url, {
        headers: {
            Authorization: `token ${pat}`,
            // Request raw content directly
            Accept: "application/vnd.github.raw",
        }
    });
    if (!response.ok) {
        // Try fetching as JSON to get error message if raw fails
        const fallbackResponse = await fetch(url, {
             headers: {
                Authorization: `token ${pat}`,
                Accept: "application/vnd.github.v3+json",
            }
        });
        const errorData = await fallbackResponse.json().catch(() => ({}));
        throw new Error(`获取文件内容失败 (SHA: ${commitSha}): ${response.status} ${response.statusText} - ${errorData.message || '未知错误'}`);
    }
    // Content is expected to be plain text (JSON for Excalidraw)
    const content = await response.text();
    return content;
}


// --- End Helper Functions ---


// --- TreeNode Component ---
interface TreeNodeProps {
  node: FileSystemNode;
  level: number;
  pat: string; // 需要 PAT 来获取版本历史
  repoFullName: string;
  branchName: string;
  selectedFilePath: string | null;
  isModified: boolean;
  modifiedFiles: Set<string>; // Pass down modified files set
  isExpanded: boolean;
  expandedPaths: Set<string>; // Pass down the full set for checking children
  onRenameRequest: (oldPath: string, newName: string) => Promise<void>;
  onDeleteRequest: (path: string, type: 'file' | 'directory') => Promise<void>;
  onSaveRequest: (filePath: string) => void;
  onToggleExpand: (path: string) => void;
  onApiError: (message: string) => void;
  onFileNodeClick: (filePath: string, content?: string, commitSha?: string) => void; // 修改签名以接受内容和 SHA
}

function TreeNode({
  node, level, pat, repoFullName, branchName, selectedFilePath, isModified, modifiedFiles, isExpanded, expandedPaths,
  onRenameRequest, onDeleteRequest, onSaveRequest, onToggleExpand, onApiError, onFileNodeClick
}: TreeNodeProps) {
  const { t } = useTranslation();
  // Remove internal isOpen state: const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(node.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenamingApiCall, setIsRenamingApiCall] = useState(false);
  const [hovered, setHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showFolderInstructionDialog, setShowFolderInstructionDialog] = useState(false);
  const [folderInstructionType, setFolderInstructionType] = useState<'rename' | 'delete' | null>(null);
  const [showVersionDialog, setShowVersionDialog] = useState(false); // State for version dialog

  const hasChildren = node.children && node.children.length > 0;

  const toggle = useCallback(() => {
    if (node.type === 'directory' && hasChildren) {
        onToggleExpand(node.path);
    }
  }, [node.path, node.type, hasChildren, onToggleExpand]);

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
      const isExcalidraw = node.type === 'file' && node.path.endsWith('.excalidraw');
      console.log(`[Debug] handleNodeClick: path=${node.path}, isExcalidraw=${isExcalidraw}`); // 添加日志
      if (node.type === 'file') {
          // 稍后会在这里添加判断
          onFileNodeClick(node.path); // 点击文件节点，加载最新版本
      } else {
          toggle(); // Toggle folder on click
      }
  };

  const handleShowVersionsClick = () => {
      if (node.type === 'file') {
          setShowVersionDialog(true);
      }
  };

  // Callback when a version is selected in the dialog
  const handleVersionSelect = async (commitSha: string) => {
      console.log(`Version selected: ${commitSha} for file ${node.path}`);
      setShowVersionDialog(false);
      onApiError(""); // Clear previous errors
      try {
          // Fetch content of the selected version
          const fileContent = await fetchFileContentAtCommit(pat, repoFullName, node.path, commitSha);
          // Pass the content and commit SHA to the parent to load in Excalidraw
          onFileNodeClick(node.path, fileContent, commitSha);
      } catch (error: any) {
          console.error("Failed to load file version:", error);
          onApiError(t('fileTree.loadVersionError', { fileName: node.name, sha: commitSha.substring(0, 7), error: error.message }));
      }
  };


  const repoUrl = `https://github.com/${repoFullName}.git`;
  const repoDirName = repoFullName.split('/')[1] || '<仓库目录>';

  return (
    <div>
      <div
        className={cn(
          "flex items-center space-x-1 py-1.5 px-2 rounded-md hover:bg-secondary hover:text-secondary-foreground",
          isRenaming ? "bg-secondary" : "",
          node.type === 'file' && node.path === selectedFilePath ? "bg-primary/10 text-primary" : ""
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
         <span onClick={toggle} className={cn("cursor-pointer p-1 -ml-1", node.type !== 'directory' && "invisible")}> {/* Hide toggle for files */}
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <div className="w-4 h-4 shrink-0" /> // Keep placeholder for alignment
          )}
        </span>
        {node.type === 'directory' ? <Folder className="h-4 w-4 shrink-0 text-sky-500" /> : (() => {
            const isExcalidraw = node.path.endsWith('.excalidraw');
            console.log(`[Debug] TreeNode render: path=${node.path}, isExcalidraw=${isExcalidraw}`); // 添加日志
            return <File className="h-4 w-4 shrink-0 text-gray-500" />; // 稍后会在这里添加条件样式
        })()}
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
            {node.name}{isModified && <span className="text-red-500 ml-1">*</span>} {/* Show * if modified */}
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
              {isModified && node.type === 'file' && ( // Show Save only for modified files
                <DropdownMenuItem onClick={() => onSaveRequest(node.path)}>
                  <Save className="mr-2 h-4 w-4" />
                  {t('fileTree.saveAction', 'Save')} {/* Add translation key */}
                </DropdownMenuItem>
              )}
               {node.type === 'file' && ( // Only show for files
                 <DropdownMenuItem onClick={handleShowVersionsClick}>
                   <History className="mr-2 h-4 w-4" />
                   {t('fileTree.versionsAction', '版本历史')}
                 </DropdownMenuItem>
               )}
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

      {isExpanded && node.children && ( // Use isExpanded prop
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              pat={pat} // Pass PAT down
              repoFullName={repoFullName}
              branchName={branchName}
              selectedFilePath={selectedFilePath}
              isModified={modifiedFiles.has(child.path)}
              modifiedFiles={modifiedFiles}
              isExpanded={expandedPaths.has(child.path)}
              expandedPaths={expandedPaths}
              onRenameRequest={onRenameRequest}
              onDeleteRequest={onDeleteRequest}
              onSaveRequest={onSaveRequest}
              onToggleExpand={onToggleExpand}
              onApiError={onApiError}
              onFileNodeClick={onFileNodeClick} // Pass down the modified handler
            />
          ))}
        </div>
      )}

       {/* Delete File Dialog */}
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

      {/* Folder Instruction Dialog */}
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

      {/* Version History Dialog */}
      {node.type === 'file' && (
          <VersionHistoryDialog
              isOpen={showVersionDialog}
              onOpenChange={setShowVersionDialog}
              pat={pat}
              repoFullName={repoFullName}
              branchName={branchName}
              filePath={node.path}
              fileName={node.name}
              onVersionSelect={handleVersionSelect}
              onApiError={onApiError} // Pass error handler
          />
      )}
    </div>
  );
}


// --- VersionHistoryDialog Component ---
interface VersionHistoryDialogProps {
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
   pat: string;
   repoFullName: string;
   branchName: string;
   filePath: string;
   fileName: string;
   onVersionSelect: (commitSha: string) => void;
   onApiError: (message: string) => void;
}

function VersionHistoryDialog({
   isOpen, onOpenChange, pat, repoFullName, branchName, filePath, fileName, onVersionSelect, onApiError
}: VersionHistoryDialogProps) {
   const { t } = useTranslation();
   const [commits, setCommits] = useState<CommitInfo[]>([]);
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [loadingVersionSha, setLoadingVersionSha] = useState<string | null>(null); // Track which version is loading
   const [hoveredSha, setHoveredSha] = useState<string | null>(null); // Track hovered item
   const { i18n } = useTranslation(); // Get i18n instance for language

   const loadCommits = useCallback(async () => {
       if (!isOpen || !pat || !repoFullName || !branchName || !filePath) return;
       setIsLoading(true);
       setError(null);
       onApiError(""); // Clear parent error
       try {
           const fetchedCommits = await fetchFileCommits(pat, repoFullName, filePath, branchName);
           setCommits(fetchedCommits);
       } catch (err: any) {
           console.error("Failed to fetch commits:", err);
           setError(err.message || t('versionHistory.loadError'));
           setCommits([]);
       } finally {
           setIsLoading(false);
       }
   }, [isOpen, pat, repoFullName, branchName, filePath, t, onApiError]);

   useEffect(() => {
       // Load commits when the dialog opens
       if (isOpen) {
           loadCommits();
       } else {
           // Reset state when dialog closes
           setCommits([]);
           setError(null);
           setIsLoading(false);
           setLoadingVersionSha(null);
       }
   }, [isOpen, loadCommits]);

   const handleSelect = async (commitSha: string) => {
       setLoadingVersionSha(commitSha); // Set loading state for this specific version
       setError(null); // Clear local error
       try {
           await onVersionSelect(commitSha); // Call parent handler (which fetches content)
       } catch (e) {
           // Error handled by the parent via onApiError in handleVersionSelect
       } finally {
          // Don't close dialog here, parent might show error
          setLoadingVersionSha(null); // Reset loading state regardless of success/fail
       }
   };

   // Get the appropriate locale for date-fns
   const getDateLocale = () => {
       const lang = i18n.language;
       if (lang.startsWith('zh')) return zhCN;
       // Add more locales as needed
       return enUS; // Default to English
   };

   const formatRelativeDate = (dateString: string) => {
       try {
           const date = parseISO(dateString);
           const locale = getDateLocale();
           // formatRelative provides strings like "yesterday", "last Sunday", etc.
           return formatRelative(date, new Date(), { locale });
       } catch (e) {
           console.error("Error formatting relative date:", e);
           return dateString; // Fallback
       }
   };

   const formatAbsoluteDate = (dateString: string) => {
       try {
           const date = parseISO(dateString);
           const locale = getDateLocale();
           // format provides a more standard absolute date format
           return format(date, 'Pp', { locale }); // 'Pp' is like '09/04/2021, 5:00:00 PM'
       } catch (e) {
           console.error("Error formatting absolute date:", e);
           return dateString; // Fallback
       }
   };

   return (
       <Dialog open={isOpen} onOpenChange={onOpenChange}>
           <DialogContent className="sm:max-w-[600px]">
               <DialogHeader>
                   <DialogTitle>{t('versionHistory.title', { fileName: fileName })}</DialogTitle>
                   <DialogDescription>
                       {t('versionHistory.description', '选择一个版本以在 Excalidraw 中查看。')}
                   </DialogDescription>
               </DialogHeader>
               <div className="mt-4">
                   {isLoading && (
                       <div className="flex items-center justify-center p-8 text-muted-foreground">
                           <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                           {t('versionHistory.loading')}
                       </div>
                   )}
                   {error && (
                       <Alert variant="destructive" className="mb-4">
                           <AlertTitle>{t('app.operationErrorTitle')}</AlertTitle>
                           <AlertDescription>{error}</AlertDescription>
                       </Alert>
                   )}
                   {!isLoading && !error && commits.length === 0 && (
                        <div className="text-center p-8 text-muted-foreground">
                           {t('versionHistory.noHistory')}
                        </div>
                   )}
                   {!isLoading && !error && commits.length > 0 && (
                       <TooltipProvider delayDuration={300}>
                           <ScrollArea className="h-[400px] border rounded-md">
                               <div className="p-1">
                                   {commits.map((commit) => (
                                       <div
                                           key={commit.sha}
                                           className={cn(
                                               "flex items-center justify-between p-2 mb-1 rounded-md hover:bg-secondary",
                                               loadingVersionSha === commit.sha && "opacity-50" // Dim while loading this version
                                           )}
                                           onMouseEnter={() => setHoveredSha(commit.sha)}
                                           onMouseLeave={() => setHoveredSha(null)}
                                       >
                                           <div className="flex-grow mr-4 overflow-hidden">
                                               <p className="text-sm font-medium truncate" title={commit.commit.message}>
                                                   {commit.commit.message.split('\n')[0]} {/* Show first line */}
                                               </p>
                                               <Tooltip>
                                                   <TooltipTrigger asChild>
                                                       <p className="text-xs text-muted-foreground truncate cursor-default">
                                                           {commit.commit.author?.name || commit.commit.committer?.name || t('versionHistory.unknownAuthor')} - {formatRelativeDate(commit.commit.author?.date || commit.commit.committer?.date || '')}
                                                       </p>
                                                   </TooltipTrigger>
                                                   <TooltipContent side="bottom" align="start">
                                                       <p>{formatAbsoluteDate(commit.commit.author?.date || commit.commit.committer?.date || '')}</p>
                                                   </TooltipContent>
                                               </Tooltip>
                                               <p className="text-xs text-muted-foreground font-mono">{commit.sha.substring(0, 7)}</p>
                                           </div>
                                           <div className="flex-shrink-0 w-16 text-right"> {/* Container for button */}
                                               {loadingVersionSha === commit.sha ? (
                                                   <Loader2 className="h-4 w-4 animate-spin inline-block" />
                                               ) : (
                                                   <Button
                                                       variant="secondary" // Change variant to secondary
                                                       size="sm"
                                                       className={cn(
                                                           "h-7 px-2 transition-opacity duration-150",
                                                           hoveredSha === commit.sha ? "opacity-100" : "opacity-0",
                                                           "focus:opacity-100" // Keep visible if focused
                                                       )}
                                                       onClick={(e) => {
                                                           e.stopPropagation(); // Prevent potential parent clicks if any
                                                           handleSelect(commit.sha);
                                                       }}
                                                       disabled={loadingVersionSha === commit.sha}
                                                   >
                                                       {t('versionHistory.openButton', 'Open')}
                                                   </Button>
                                               )}
                                           </div>
                                       </div>
                                   ))}
                                   {/* TODO: Add pagination if needed */}
                               </div>
                           </ScrollArea>
                       </TooltipProvider>
                   )}
               </div>
               <DialogFooter>
                   <DialogClose asChild>
                       <Button variant="outline">{t('patInput.closeButton')}</Button>
                   </DialogClose>
               </DialogFooter>
           </DialogContent>
       </Dialog>
   );
}


// --- GithubFileTree Component ---
interface GithubFileTreeProps {
 pat: string;
 repoFullName: string;
 branchName: string;
 // Modify signature to accept optional content and commitSha
 onFileNodeClick: (filePath: string, content?: string, commitSha?: string) => void;
 selectedFilePath: string | null;
 modifiedFiles: Set<string>;
 onSaveRequest: (filePath: string) => void;
}

export interface GithubFileTreeRef {
  refreshTree: () => void;
  createFile: (filePath: string) => Promise<{ path: string; sha: string }>; // Correct return type
}

export const GithubFileTree = forwardRef<GithubFileTreeRef, GithubFileTreeProps>(
  ({ pat, repoFullName, branchName, onFileNodeClick, selectedFilePath, modifiedFiles, onSaveRequest }, ref) => {
    const { t } = useTranslation();
    const [fileTree, setFileTree] = useState<FileSystemNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null); // Keep this for general API errors
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set()); // State for expanded folders

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

    // Handler to toggle folder expansion state
    const handleToggleExpand = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) {
                newSet.delete(path);
            } else {
                newSet.add(path);
            }
            return newSet;
        });
    }, []);

    useImperativeHandle(ref, () => ({
      refreshTree: () => {
        loadFileTree();
      },
      createFile: async (rawFilePath: string): Promise<{ path: string; sha: string }> => {
        const filePath = rawFilePath.endsWith('.excalidraw') ? rawFilePath : `${rawFilePath}.excalidraw`;
        const initialContent = JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "excalidraw-gh",
          elements: [],
          appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
          files: {},
        }, null, 2);

        console.log(`API: Creating Excalidraw file ${filePath}`);
        setApiError(null);
        try {
          const creationResult = await createGithubFile( // Capture result
            pat,
            repoFullName,
            filePath,
            initialContent,
            branchName,
            `feat: create Excalidraw file ${filePath.split('/').pop()}`
          );
          // Don't refresh immediately, return the details instead
          // await loadFileTree();
          return creationResult; // Return path and SHA
        } catch (error: any) {
          console.error("Create file API call failed:", error);
          setApiError(t('createFileDialog.apiError', { filePath: filePath, error: error.message }));
          throw error;
        }
      },
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

   // This function now handles both latest and historical file clicks
   const handleFileNodeClick = useCallback((filePath: string, content?: string, commitSha?: string) => {
       console.log(`File node clicked: ${filePath}`, commitSha ? `(Version: ${commitSha.substring(0,7)})` : '(Latest)');
       // Clear API error when selecting a new file/version
       setApiError(null);
       // Call the prop passed from the parent (App.tsx)
       onFileNodeClick(filePath, content, commitSha);
   }, [onFileNodeClick]);


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
                {apiError && ( // Display API errors (like version loading errors) here
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
                key={node.path}
                node={node}
                level={0}
                pat={pat} // Pass PAT
                repoFullName={repoFullName}
                branchName={branchName}
                selectedFilePath={selectedFilePath}
                isModified={modifiedFiles.has(node.path)}
                onRenameRequest={handleRenameNode}
                onDeleteRequest={handleDeleteNode}
                modifiedFiles={modifiedFiles}
                isExpanded={expandedPaths.has(node.path)}
                expandedPaths={expandedPaths}
                onSaveRequest={onSaveRequest}
                onToggleExpand={handleToggleExpand}
                onApiError={setApiError} // Pass down the setter for API errors
                onFileNodeClick={handleFileNodeClick} // Pass down the unified click handler
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

GithubFileTree.displayName = "GithubFileTree";