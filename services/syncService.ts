
import { VFS, SyncResponse } from "../types";
import { UPDATE_ENDPOINT } from "../constants";

const cleanCode = (code: string): string => {
  if (!code) return code;
  let cleaned = code;
  if (cleaned.includes('RefreshRuntime')) {
    const firstImport = cleaned.search(/import\s+(React|{)/);
    if (firstImport !== -1) {
      cleaned = cleaned.substring(firstImport);
    }
  }
  cleaned = cleaned.replace(/\$RefreshReg\$\([\s\S]*?\);?/g, '');
  cleaned = cleaned.replace(/\$RefreshSig\$\(\)[\s\S]*?;?/g, '');
  cleaned = cleaned.replace(/_s\(\);?/g, '');
  return cleaned.trim();
};

export const syncProject = async (vfs: VFS): Promise<SyncResponse> => {
  try {
    const cleanFiles: Partial<VFS> = {};
    for (const [name, content] of Object.entries(vfs)) {
      cleanFiles[name as keyof VFS] = cleanCode(content);
    }

    const response = await fetch(UPDATE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '69420',
      },
      body: JSON.stringify({ files: cleanFiles }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error (${response.status}): ${errorText || response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Sync Service Error:", error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : "Unknown network error" 
    };
  }
};
