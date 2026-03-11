import { useState, useEffect } from 'react'; // Removed unused React and useCallback imports
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"; // Removed DialogClose as it's handled by onOpenChange
import { commitGithubFiles, getFileSha, updateGithubFile } from './GithubFileTree';
import { serializeAsJSON } from '@excalidraw/excalidraw'; // Import Excalidraw's serialization utility
import type { ExcalidrawSceneData } from '../lib/excalidrawScene';

interface SaveFileDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  filePathsToSave: string[];
  pat: string | null; // PAT might be null initially
  repoFullName: string | null;
  branchName: string | null;
  getLatestContent: (filePath: string | null) => Promise<ExcalidrawSceneData | null>;
  onSaveSuccess: (filePaths: string[], newShasByPath: Record<string, string>) => void;
  onSaveCancel: () => void;
  onSaveError: (error: Error) => void;
}

export function SaveFileDialog({
  isOpen,
  onOpenChange,
  filePathsToSave,
  pat,
  repoFullName,
  branchName,
  getLatestContent,
  onSaveSuccess, // Updated signature
  onSaveCancel,
  onSaveError,
}: SaveFileDialogProps) {
  const { t } = useTranslation();
  const [commitMessage, setCommitMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const targetFilePaths = filePathsToSave.filter((filePath): filePath is string => Boolean(filePath));
  const targetFilePathsKey = targetFilePaths.join('\n');
  const isBatchSave = targetFilePaths.length > 1;
  const primaryFilePath = targetFilePaths[0] ?? null;

  // Reset state when dialog opens with a new file
  useEffect(() => {
    if (isOpen && targetFilePaths.length > 0) {
      setCommitMessage(
        targetFilePaths.length > 1
          ? `feat: update ${targetFilePaths.length} excalidraw files`
          : `feat: update ${targetFilePaths[0].split('/').pop()}`,
      );
      setIsSaving(false);
      setSaveError(null);
    }
  }, [isOpen, targetFilePathsKey]);

  const handleSave = async () => {
    // Prevent double execution if already saving
    if (isSaving) {
        console.warn('[DEBUG] SaveFileDialog: handleSave called while already saving. Ignoring.');
        return;
    }
    console.log(`%c[DEBUG] SaveFileDialog: handleSave CALLED for: ${targetFilePaths.join(', ')}`, 'color: orange; font-weight: bold;');

    if (!pat || !repoFullName || !branchName || targetFilePaths.length === 0 || !commitMessage.trim()) {
      setSaveError(t('saveDialog.missingInfoError', 'Missing required information (PAT, repo, branch, path, or commit message).'));
      console.error('[DEBUG] SaveFileDialog: Missing required info.');
      return;
    }

    const latestContents = await Promise.all(
      targetFilePaths.map(async (filePath) => ({
        filePath,
        content: await getLatestContent(filePath),
      })),
    );

    const filesMissingContent = latestContents
      .filter(({ content }) => !content)
      .map(({ filePath }) => filePath);

    if (filesMissingContent.length > 0) {
      setSaveError(
        t('saveDialog.getContentErrorForFiles', {
          defaultValue: 'Could not retrieve the latest content for: {{fileNames}}',
          fileNames: filesMissingContent.join(', '),
        }),
      );
      console.error('[DEBUG] SaveFileDialog: getLatestContent returned null for files:', filesMissingContent);
      return;
    }

    const serializedContents = latestContents.map(({ filePath, content }) => ({
      filePath,
      contentToSave: serializeAsJSON(
        content!.elements,
        content!.appState,
        content!.files ?? {},
        'database',
      ),
    }));

    console.log('[DEBUG] SaveFileDialog: Setting isSaving to true.');
    setIsSaving(true);
    setSaveError(null);

    try {
      if (serializedContents.length === 1) {
        const [{ filePath, contentToSave }] = serializedContents;
        console.log('[DEBUG] SaveFileDialog: Attempting to get current SHA...');
        const currentSha = await getFileSha(pat, repoFullName, filePath, branchName);
        console.log(`[DEBUG] SaveFileDialog: Got SHA: ${currentSha}`);
        console.log('[DEBUG] SaveFileDialog: Serialized content string (start):', contentToSave.substring(0, 100));
        console.log(`[DEBUG] SaveFileDialog: Calling updateGithubFile for ${filePath} with SHA ${currentSha ?? 'null (create)'}...`);

        const updateResult = await updateGithubFile(
          pat,
          repoFullName,
          filePath,
          contentToSave,
          branchName,
          commitMessage.trim(),
          currentSha ?? undefined,
        );

        console.log(`%c[DEBUG] SaveFileDialog: updateGithubFile successful. New SHA: ${updateResult.sha}`, 'color: green;');
        onSaveSuccess([filePath], { [filePath]: updateResult.sha });
      } else {
        console.log(`[DEBUG] SaveFileDialog: Calling commitGithubFiles for ${serializedContents.length} files...`);
        const updateResult = await commitGithubFiles(
          pat,
          repoFullName,
          branchName,
          serializedContents.map(({ filePath, contentToSave }) => ({
            path: filePath,
            content: contentToSave,
          })),
          commitMessage.trim(),
        );

        console.log(`%c[DEBUG] SaveFileDialog: commitGithubFiles successful. Commit SHA: ${updateResult.commitSha}`, 'color: green;');
        onSaveSuccess(targetFilePaths, updateResult.fileShas);
      }

      onOpenChange(false); // Close dialog

    } catch (error: any) {
      console.error("Save file API call failed:", error);
      const errorMessage = error.message || t('saveDialog.unknownApiError', 'An unknown error occurred during save.');
      console.error(`[DEBUG] SaveFileDialog: Save failed! Error: ${errorMessage}`);
      setSaveError(errorMessage);
      onSaveError(new Error(errorMessage)); // Notify parent
    } finally {
      console.log('[DEBUG] SaveFileDialog: Setting isSaving to false.');
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    onSaveCancel();
    onOpenChange(false);
  };

  // Prevent closing via overlay click or escape key while saving
  const handleOpenChange = (open: boolean) => {
    if (!isSaving) {
      onOpenChange(open);
      if (!open) {
        onSaveCancel(); // Ensure cancel callback is called if closed externally
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('saveDialog.title', 'Save File')}</DialogTitle>
          <DialogDescription>
            {isBatchSave
              ? t('saveDialog.descriptionBatch', 'Enter one commit message to save {{count}} files.', { count: targetFilePaths.length })
              : t('saveDialog.description', 'Enter a commit message for saving "{{fileName}}".', { fileName: primaryFilePath || '...' })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {isBatchSave && (
            <div className="space-y-2">
              <Label>{t('saveDialog.filesLabel', 'Files')}</Label>
              <div className="max-h-32 overflow-y-auto rounded-md border p-3 text-sm text-muted-foreground">
                {targetFilePaths.slice(0, 8).map((filePath) => (
                  <div key={filePath} className="truncate">
                    {filePath}
                  </div>
                ))}
                {targetFilePaths.length > 8 && (
                  <div className="mt-2 text-xs">
                    {t('saveDialog.moreFilesLabel', 'And {{count}} more files...', {
                      count: targetFilePaths.length - 8,
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="commit-message">{t('saveDialog.commitMessageLabel', 'Commit Message')}</Label>
            <Input
              id="commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder={t('saveDialog.commitMessagePlaceholder', 'e.g., Update diagram with new flow')}
              disabled={isSaving}
            />
          </div>
          {saveError && (
            <Alert variant="destructive">
              <AlertTitle>{t('saveDialog.errorTitle', 'Save Failed')}</AlertTitle>
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            {t('saveDialog.cancelButton', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !commitMessage.trim()}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving
              ? t('saveDialog.savingButton', 'Saving...')
              : isBatchSave
                ? t('saveDialog.saveAllButton', 'Save All')
                : t('saveDialog.saveButton', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
