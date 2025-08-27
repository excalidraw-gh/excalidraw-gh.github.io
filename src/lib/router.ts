// 路由相关的工具函数

export interface RouteParams {
  repo?: string;
  branch?: string;
  filePath?: string;
}

// 编码路由参数为URL安全的字符串
export function encodeRouteParam(param: string): string {
  return encodeURIComponent(param);
}

// 解码URL参数
export function decodeRouteParam(param: string): string {
  return decodeURIComponent(param);
}

// 构建文件路由路径
export function buildFileRoute(repo: string, branch: string, filePath: string): string {
  const encodedRepo = encodeRouteParam(repo);
  const encodedBranch = encodeRouteParam(branch);
  const encodedFilePath = encodeRouteParam(filePath);
  return `/repo/${encodedRepo}/branch/${encodedBranch}/file/${encodedFilePath}`;
}

// 构建仓库路由路径
export function buildRepoRoute(repo: string, branch?: string): string {
  const encodedRepo = encodeRouteParam(repo);
  if (branch) {
    const encodedBranch = encodeRouteParam(branch);
    return `/repo/${encodedRepo}/branch/${encodedBranch}`;
  }
  return `/repo/${encodedRepo}`;
}

// 解析路由参数
export function parseRouteParams(pathname: string): RouteParams {
  const params: RouteParams = {};
  
  // 匹配 /repo/:repo/branch/:branch/file/:filePath 格式
  const fileMatch = pathname.match(/^\/repo\/([^\/]+)\/branch\/([^\/]+)\/file\/(.+)$/);
  if (fileMatch) {
    params.repo = decodeRouteParam(fileMatch[1]);
    params.branch = decodeRouteParam(fileMatch[2]);
    params.filePath = decodeRouteParam(fileMatch[3]);
    return params;
  }
  
  // 匹配 /repo/:repo/branch/:branch 格式
  const branchMatch = pathname.match(/^\/repo\/([^\/]+)\/branch\/([^\/]+)$/);
  if (branchMatch) {
    params.repo = decodeRouteParam(branchMatch[1]);
    params.branch = decodeRouteParam(branchMatch[2]);
    return params;
  }
  
  // 匹配 /repo/:repo 格式
  const repoMatch = pathname.match(/^\/repo\/([^\/]+)$/);
  if (repoMatch) {
    params.repo = decodeRouteParam(repoMatch[1]);
    return params;
  }
  
  return params;
}

// 检查是否为有效的路由路径
export function isValidRoute(pathname: string): boolean {
  return pathname === '/' || 
         /^\/repo\/[^\/]+$/.test(pathname) ||
         /^\/repo\/[^\/]+\/branch\/[^\/]+$/.test(pathname) ||
         /^\/repo\/[^\/]+\/branch\/[^\/]+\/file\/.+$/.test(pathname);
} 