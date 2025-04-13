import React, { useState, useEffect, useCallback } from 'react';
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
import { getFileSha, updateGithubFile } from './GithubFileTree';
import { serializeAsJSON } from '@excalidraw/excalidraw'; // Import Excalidraw's serialization utility

interface SaveFileDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  filePathToSave: string | null;
  pat: string | null; // PAT might be null initially
  repoFullName: string | null;
  branchName: string | null;
  getLatestContent: () => { elements: readonly any[]; appState: any } | null;
  onSaveSuccess: (filePath: string, newSha: string) => void; // Add newSha parameter
  onSaveCancel: () => void;
  onSaveError: (error: Error) => void;
}

export function SaveFileDialog({
  isOpen,
  onOpenChange,
  filePathToSave,
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

  // Reset state when dialog opens with a new file
  useEffect(() => {
    if (isOpen && filePathToSave) {
      setCommitMessage(`feat: update ${filePathToSave.split('/').pop()}`); // Default commit message
      setIsSaving(false);
      setSaveError(null);
    }
  }, [isOpen, filePathToSave]);

  const handleSave = async () => {
    // Prevent double execution if already saving
    if (isSaving) {
        console.warn('[DEBUG] SaveFileDialog: handleSave called while already saving. Ignoring.');
        return;
    }
    console.log(`%c[DEBUG] SaveFileDialog: handleSave CALLED for: ${filePathToSave}`, 'color: orange; font-weight: bold;');

    if (!pat || !repoFullName || !branchName || !filePathToSave || !commitMessage.trim()) {
      setSaveError(t('saveDialog.missingInfoError', 'Missing required information (PAT, repo, branch, path, or commit message).'));
      console.error('[DEBUG] SaveFileDialog: Missing required info.');
      return;
    }

    const latestContent = getLatestContent();
    if (!latestContent) {
      setSaveError(t('saveDialog.getContentError', 'Could not retrieve latest content from editor.'));
      console.error('[DEBUG] SaveFileDialog: getLatestContent returned null.');
      return;
    }

    console.log('[DEBUG] SaveFileDialog: Setting isSaving to true.');
    setIsSaving(true);
    setSaveError(null);

    try {
      // 1. Get current SHA of the file
      console.log('[DEBUG] SaveFileDialog: Attempting to get current SHA...');
      const currentSha = await getFileSha(pat, repoFullName, filePathToSave, branchName);
      console.log(`[DEBUG] SaveFileDialog: Got SHA: ${currentSha}`);

      // --- DEBUG LOG ---
      console.log('[DEBUG] SaveFileDialog: Preparing to save. Latest content retrieved:');
      console.log(`[DEBUG]   - Elements count: ${latestContent.elements?.length}`);
      console.log(`[DEBUG]   - AppState keys: ${Object.keys(latestContent.appState || {}).join(', ')}`);
      console.log(`[DEBUG]   - AppState.collaborators type: ${typeof latestContent.appState?.collaborators}`);
      console.log(`[DEBUG]   - AppState.collaborators value:`, latestContent.appState?.collaborators);
      // --- END DEBUG LOG ---

      // 2. Prepare content string using Excalidraw's utility
      const contentToSave = serializeAsJSON(
          latestContent.elements,
          latestContent.appState,
          {}, // files - assuming none for now
          'database' // type - 'database' is suitable for backend/storage
      );
      console.log('[DEBUG] SaveFileDialog: Serialized content string (start):', contentToSave.substring(0, 100));

      // 3. Call update API and capture the result
      console.log(`[DEBUG] SaveFileDialog: Calling updateGithubFile for ${filePathToSave} with SHA ${currentSha ?? 'null (create)'}...`);
      const updateResult = await updateGithubFile(
        pat,
        repoFullName,
        filePathToSave,
        contentToSave, // Use the serialized string
        branchName,
        commitMessage.trim(),
        currentSha ?? undefined // Pass SHA if it exists
      );

      console.log(`%c[DEBUG] SaveFileDialog: updateGithubFile successful. New SHA: ${updateResult.sha}`, 'color: green;');
      onSaveSuccess(filePathToSave, updateResult.sha); // Notify parent with new SHA
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
            {t('saveDialog.description', 'Enter a commit message for saving "{{fileName}}".', { fileName: filePathToSave || '...' })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
            {isSaving ? t('saveDialog.savingButton', 'Saving...') : t('saveDialog.saveButton', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}