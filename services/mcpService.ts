
import { MCPSettings, Workflow } from "../types";

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
});

const handleResponse = async (response: Response) => {
  if (response.status === 406 || response.status === 404) {
    throw new Error('Ngrok tunnel may need manual re-authentication. Please open the bridge URL in a new tab.');
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  
  return await response.json();
};

export const mcpService = {
  /**
   * Configures the bridge server with the target n8n URL and Token.
   */
  async setup(bridgeUrl: string, n8nUrl: string, n8nToken: string): Promise<any> {
    const response = await fetch(`${bridgeUrl}/setup`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        url: n8nUrl,
        token: n8nToken
      }),
    });
    return handleResponse(response);
  },

  /**
   * Lists available tools from the bridge.
   */
  async fetchTools(bridgeUrl: string): Promise<any[]> {
    const response = await fetch(`${bridgeUrl}/tools`, {
      method: 'GET',
      headers: getHeaders(),
    });
    const data = await handleResponse(response);
    return data.result?.tools || data.tools || (Array.isArray(data) ? data : []);
  },

  /**
   * Discovery: Search for active workflows via MCP tool.
   */
  async searchWorkflows(bridgeUrl: string, limit: number = 10): Promise<Workflow[]> {
    const response = await fetch(`${bridgeUrl}/execute`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        toolName: 'search_workflows',
        args: { limit }
      }),
    });
    const data = await handleResponse(response);
    
    let rawWorkflows = [];
    if (data.result?.structuredContent?.data) {
      rawWorkflows = data.result.structuredContent.data;
    } else if (data.result?.output?.data) {
      rawWorkflows = data.result.output.data;
    } else if (Array.isArray(data)) {
      rawWorkflows = data;
    }

    return rawWorkflows.map((item: any) => ({
      id: item.id || 'N/A',
      name: item.name || 'Untitled Workflow',
      active: !!item.active
    }));
  },

  /**
   * Read Technical Details: Analyze specific workflow structure.
   * Now captures the rich structuredContent (runData/pinData) for AI analysis.
   */
  async getWorkflowDetails(bridgeUrl: string, workflowId: string): Promise<Workflow> {
    const response = await fetch(`${bridgeUrl}/execute`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        toolName: 'get_workflow_details',
        args: { workflowId }
      }),
    });
    const data = await handleResponse(response);
    
    // The details often come inside result.structuredContent or result.output
    const rawData = data.result || data.output || data;
    const structured = rawData.structuredContent || rawData;

    return {
      id: workflowId,
      name: rawData.name || 'Workflow Technical Profile',
      nodes: rawData.nodes || [],
      schema: structured // Passing the whole structured object (runData/pinData) to Gemini
    };
  },

  /**
   * Live Execution: Test the workflow from the IDE.
   */
  async executeWorkflow(bridgeUrl: string, workflowId: string, chatInput: string): Promise<any> {
    const sessionId = Math.random().toString(36).substring(2, 15);
    const timestamp = new Date().toISOString();

    const webhookData = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-source': 'mcp-studio',
        'x-session-id': sessionId
      },
      query: {},
      body: {
        'key': sessionId,
        'session_id': sessionId,
        'source': 'http-gateway',
        'mensagem': chatInput,
        'timestamp': timestamp
      }
    };

    const response = await fetch(`${bridgeUrl}/execute`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        toolName: 'execute_workflow',
        args: {
          workflowId,
          inputs: {
            type: 'webhook',
            webhookData: webhookData
          }
        }
      }),
    });
    
    const data = await handleResponse(response);
    return data.result || data.output || data;
  }
};
