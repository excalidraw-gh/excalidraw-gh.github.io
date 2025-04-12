// vite-project/src/components/GithubPatInput.tsx
import React, { useState } from "react";
import { useTranslation } from 'react-i18next'; // Import useTranslation
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { savePat, deletePat } from "@/lib/db"; // 导入 db 函数
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // 导入 Alert 组件
import { Loader2 } from "lucide-react"; // 导入 Loader icon

interface GithubPatInputProps {
  onPatSaved: (pat: string) => void; // 当 PAT 成功验证并保存后调用
  onPatCleared: () => void; // 当 PAT 被清除时调用
  initialPat?: string | null; // 初始 PAT（如果已存在）
}

// 验证 PAT 的函数
async function validatePat(pat: string): Promise<boolean> {
  if (!pat) return false; // 基本检查
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json", // 推荐添加 Accept header
      },
    });
    // 检查状态码是否表示成功 (200-299)
    // 特别地，401 表示 Bad credentials，也是一种验证“失败”
    return response.ok;
  } catch (error) {
    console.error("Error validating PAT:", error);
    // 网络错误等也视为验证失败
    return false;
  }
}

export function GithubPatInput({ onPatSaved, onPatCleared, initialPat }: GithubPatInputProps) {
  const { t } = useTranslation(); // Initialize hook
  const [pat, setPat] = useState(initialPat || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 使用 initialPat 来确定初始状态是否已保存
  const [isSaved, setIsSaved] = useState(!!initialPat);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const trimmedPat = pat.trim();
    if (!trimmedPat) {
      setError(t('patInput.emptyError'));
      setIsLoading(false);
      return;
    }

    const isValid = await validatePat(trimmedPat);

    if (isValid) {
      try {
        await savePat(trimmedPat);
        setIsSaved(true);
        setIsLoading(false);
        onPatSaved(trimmedPat); // 通知父组件
      } catch (dbError) {
        console.error("Error saving PAT to DB:", dbError);
        setError(t('patInput.saveError'));
        setIsLoading(false);
      }
    } else {
      setError(t('patInput.validationError'));
      setIsLoading(false);
    }
  };

  const handleClearPat = async () => {
    setError(null); // 清除错误状态
    try {
      await deletePat();
      setPat(""); // 清空输入框
      setIsSaved(false); // 更新保存状态
      onPatCleared(); // 通知父组件
    } catch (dbError) {
      console.error("Error deleting PAT from DB:", dbError);
      setError(t('patInput.clearError'));
    }
  };

  // 如果 PAT 已保存，显示确认信息和操作按钮
  if (isSaved) {
    return (
      <div className="p-4 border rounded-md bg-green-50 border-green-200 space-y-3">
         <Alert variant="default" className="bg-green-100 border-green-300">
           <AlertTitle className="text-green-800">{t('patInput.savedAlertTitle')}</AlertTitle>
           <AlertDescription className="text-green-700">
             {t('patInput.savedAlertDesc')}
           </AlertDescription>
         </Alert>
        <div className="flex space-x-2 pt-2">
           <Button variant="outline" size="sm" onClick={() => { setIsSaved(false); setError(null); }}>
             {t('patInput.modifyButton')}
           </Button>
           <Button variant="destructive" size="sm" onClick={handleClearPat}>
             {t('patInput.clearButton')}
           </Button>
        </div>
         {error && (
           <Alert variant="destructive" className="mt-2">
             <AlertTitle>{t('app.operationErrorTitle')}</AlertTitle> {/* Use generic error title */}
             <AlertDescription>{error}</AlertDescription>
           </Alert>
         )}
      </div>
    );
  }

  // 否则，显示输入表单
  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-md">
      <div className="space-y-2">
        <Label htmlFor="github-pat">{t('patInput.label')}</Label>
        <Input
          id="github-pat"
          type="password"
          placeholder={t('patInput.placeholder')}
          value={pat}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setPat(e.target.value);
            setError(null); // 输入时清除错误
          }}
          required
          disabled={isLoading}
          className={error ? "border-red-500 focus-visible:ring-red-500" : ""} // 错误时高亮边框
        />
        <p className="text-xs text-muted-foreground">
          {t('patInput.requiredScope')} {t('patInput.storageInfo')}
        </p>
      </div>

      {/* 显示验证或保存时发生的错误 */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t('app.operationErrorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={isLoading || !pat.trim()} className="w-full sm:w-auto">
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isLoading ? t('patInput.savingButton') : t('patInput.saveButton')}
      </Button>
    </form>
  );
}