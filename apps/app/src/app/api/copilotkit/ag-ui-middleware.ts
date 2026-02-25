import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { placeholderMiddleware } from "@/app/api/copilotkit/placeholder-middleware";

export const aguiMiddleware = [
  placeholderMiddleware,
  new MCPAppsMiddleware({
    mcpServers: [
      {
        type: "http",
        url:
          process.env.MCP_SERVER_URL ||"https://mcp.excalidraw.com",
        serverId: "example_mcp_app",
      },
    ],
  }),
];
