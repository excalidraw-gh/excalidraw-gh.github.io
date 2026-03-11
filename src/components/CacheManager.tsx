import React, { useState, useEffect } from 'react';
import { getAllCachedFiles, deleteCachedFile, clearCachedFiles, CachedFileData } from '../lib/db';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, RefreshCw, FileText, Clock, GitBranch, Folder } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CacheManagerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentRepo?: string;
  currentBranch?: string;
  onRestoreFile?: (file: CachedFileData) => void;
  onCacheChanged?: () => void;
}

export const CacheManager: React.FC<CacheManagerProps> = ({
  isOpen,
  onOpenChange,
  currentRepo,
  currentBranch,
  onRestoreFile,
  onCacheChanged
}) => {
  const [cachedFiles, setCachedFiles] = useState<CachedFileData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载缓存文件列表
  const loadCachedFiles = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const files = await getAllCachedFiles();
      setCachedFiles(files);
    } catch (err) {
      console.error('Failed to load cached files:', err);
      setError('Failed to load cached files');
    } finally {
      setIsLoading(false);
    }
  };

  // 删除单个缓存文件
  const handleDeleteFile = async (file: CachedFileData) => {
    try {
      await deleteCachedFile(file.repoFullName, file.branch, file.filePath);
      onCacheChanged?.();
      await loadCachedFiles(); // 重新加载列表
    } catch (err) {
      console.error('Failed to delete cached file:', err);
      setError('Failed to delete cached file');
    }
  };

  // 清除所有缓存
  const handleClearAllCache = async () => {
    try {
      await clearCachedFiles();
      onCacheChanged?.();
      setCachedFiles([]);
    } catch (err) {
      console.error('Failed to clear all cache:', err);
      setError('Failed to clear all cache');
    }
  };

  // 清除当前仓库和分支的缓存
  const handleClearCurrentCache = async () => {
    if (!currentRepo || !currentBranch) return;
    
    try {
      await clearCachedFiles(currentRepo, currentBranch);
      onCacheChanged?.();
      await loadCachedFiles(); // 重新加载列表
    } catch (err) {
      console.error('Failed to clear current cache:', err);
      setError('Failed to clear current cache');
    }
  };

  // 恢复文件
  const handleRestoreFile = (file: CachedFileData) => {
    if (onRestoreFile) {
      onRestoreFile(file);
    }
    onOpenChange(false);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // 当对话框打开时加载数据
  useEffect(() => {
    if (isOpen) {
      loadCachedFiles();
    }
  }, [isOpen]);

  // 按仓库和分支分组文件
  const groupedFiles = cachedFiles.reduce((groups, file) => {
    const key = `${file.repoFullName}:${file.branch}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(file);
    return groups;
  }, {} as Record<string, CachedFileData[]>);

  // 当前仓库和分支的文件
  const currentFiles = currentRepo && currentBranch 
    ? cachedFiles.filter(f => f.repoFullName === currentRepo && f.branch === currentBranch)
    : [];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            缓存管理器
          </DialogTitle>
          <DialogDescription>
            管理本地缓存的未提交文件更改
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 操作按钮 */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={loadCachedFiles}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            
            {currentRepo && currentBranch && currentFiles.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCurrentCache}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                清除当前分支缓存 ({currentFiles.length})
              </Button>
            )}
            
            {cachedFiles.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAllCache}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                清除所有缓存
              </Button>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 缓存文件列表 */}
          <ScrollArea className="h-[400px] w-full border rounded-md p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-20">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                加载中...
              </div>
            ) : cachedFiles.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                没有缓存的文件
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedFiles).map(([key, files]) => {
                  const [repoName, branch] = key.split(':');
                  const isCurrentGroup = repoName === currentRepo && branch === currentBranch;
                  
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4" />
                        <span className="font-medium">{repoName}</span>
                        <GitBranch className="h-4 w-4" />
                        <span className="text-sm text-muted-foreground">{branch}</span>
                        {isCurrentGroup && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            当前
                          </span>
                        )}
                      </div>
                      
                      <div className="ml-6 space-y-2">
                        {files.map((file, index) => (
                          <div
                            key={`${file.filePath}-${index}`}
                            className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 flex-shrink-0" />
                                <span className="font-medium truncate">
                                  {file.filePath.split('/').pop()}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                <span className="truncate">{file.filePath}</span>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(file.lastModified)}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 ml-4">
                              {isCurrentGroup && onRestoreFile && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRestoreFile(file)}
                                >
                                  恢复
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteFile(file)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {Object.keys(groupedFiles).length > 1 && (
                        <div className="border-t my-4"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 
