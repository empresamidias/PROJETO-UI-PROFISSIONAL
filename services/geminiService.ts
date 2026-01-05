
import { GoogleGenAI, Type } from "@google/genai";
import { VFS, Workflow } from "../types.ts";

export const generateAppCode = async (prompt: string, workflowContext?: Workflow, currentVfs?: VFS): Promise<VFS> => {
  // Always initialize right before use to ensure latest API key if applicable as per guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

  const hasExistingCode = currentVfs && Object.keys(currentVfs).length > 0;

  let mcpProtocol = `
## 🛠️ MCP BRIDGE CAPABILITIES
You are integrated with an n8n MCP Bridge. You can consume technical readouts of workflows.

## 🧭 CRAFTING PROTOCOL (MODULAR ROOT ARCHITECTURE)
Assemble the application directly in the workspace root. Organization:

1. **index.html**: Root file referencing './index.tsx'. (CRITICAL: Use relative path with dot './index.tsx')
2. **index.tsx**: React mounting logic.
3. **App.tsx**: Main orchestrator. Import UI from './components/' and logic from './services/'.
4. **components/**: UI components (e.g., components/Header.tsx).
5. **services/**: API and business logic (e.g., services/n8n.ts).
6. **types.ts**: Global TS definitions.

## 🧠 INTELLIGENCE MAPPING
Analyze the provided workflow (runData/pinData):
- Webhook fields -> Component inputs.
- Responses -> Typed UI displays.
- Execution logic -> services/n8n.ts.
`;

  let contextSnippet = "";
  if (workflowContext) {
    contextSnippet = `
    WORKFLOW SELECTED: "${workflowContext.name}"
    TECHNICAL DATA: ${JSON.stringify(workflowContext.schema || workflowContext.nodes || workflowContext)}
    `;
  }

  let existingCodeSnippet = "";
  if (hasExistingCode) {
    existingCodeSnippet = `
    EXISTING PROJECT CODE:
    ${JSON.stringify(currentVfs)}
    
    INSTRUCTION: This is an UPDATE/REFINEMENT. Apply the changes requested in the prompt to the existing code above. 
    Maintain the existing structure but improve or extend it as requested. Do not hallucinate files outside the root structure.
    `;
  }

  const systemPrompt = hasExistingCode 
    ? `You are an expert React developer specializing in iterative improvements. Refine the existing project based on: "${prompt}".` 
    : `You are a world-class React architect. Create a professional, modular application from scratch based on: "${prompt}".`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `
    ${systemPrompt}
    
    ${mcpProtocol}
    ${contextSnippet}
    ${existingCodeSnippet}

CRITICAL RULES:
- NO 'src/' FOLDER. Use root-level components/ and services/.
- index.html MUST reference "./index.tsx" (RELATIVE PATH).
- All imports between files must be relative (e.g. './components/Header').
- Use Tailwind CSS.
- Use 'export default function App() { ... }' or 'export const App = () => { ... }' in App.tsx.

OUTPUT FORMAT:
Return only raw JSON where keys are file paths and values are file contents. Provide the COMPLETE VFS (all files in the project), not just the changed ones. Ensure the JSON is valid.`,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 12000 }
    }
  });

  const text = response.text;
  if (!text) throw new Error("AI failed to generate response.");

  try {
    return JSON.parse(text.trim()) as VFS;
  } catch (err) {
    console.error("Parse Error:", text);
    throw new Error("Failed to parse AI response. Ensure output is valid JSON VFS.");
  }
};
