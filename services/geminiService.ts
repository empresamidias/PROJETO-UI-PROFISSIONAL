
import { GoogleGenAI, Type } from "@google/genai";
import { VFS, Workflow } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const generateAppCode = async (prompt: string, workflowContext?: Workflow): Promise<VFS> => {
  let mcpProtocol = `
## 🛠️ MCP BRIDGE CAPABILITIES
You are integrated with an n8n MCP Bridge. You can consume technical readouts of workflows.

## 🧭 CRAFTING PROTOCOL (MODULAR ROOT ARCHITECTURE)
Assemble the application directly in the workspace root. Organization:

1. **index.html**: Root file referencing '/main.tsx'.
2. **main.tsx**: React mounting logic.
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

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `You are a world-class React architect. Create a professional, modular application based on: "${prompt}".
    
    ${mcpProtocol}
    ${contextSnippet}

CRITICAL RULES:
- NO 'src/' FOLDER. Use root-level components/ and services/.
- index.html references "/main.tsx".
- All imports between files must be relative (e.g. './components/Header').
- Use Tailwind CSS.
- Export main component from App.tsx as: export const App = () => { ... }.

OUTPUT FORMAT:
Return only raw JSON where keys are file paths and values are file contents.`,
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
