import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { EventType } from "@ag-ui/client";
import { NextRequest } from "next/server";
import { aguiMiddleware } from "@/app/api/copilotkit/ag-ui-middleware";

// ---------------------------------------------------------------------------
// Subclass: forward unknown custom events to the middleware pipeline
// ---------------------------------------------------------------------------
// CopilotKit's LangGraphAgent.dispatchEvent() handles its own custom events
// (manually_emit_message, manually_emit_tool_call, etc.) but may silently
// drop unknown ones. This override ensures ANY custom event emitted by a
// LangGraph agent via dispatch_custom_event() reaches the middleware.
// ---------------------------------------------------------------------------

class CustomEventForwardingAgent extends LangGraphAgent {
  dispatchEvent(event: any): boolean {
    if (event.type === EventType.CUSTOM) {
      const COPILOTKIT_PREFIXES = ["copilotkit_", "copilotkit:"];
      const isInternal = COPILOTKIT_PREFIXES.some((p) => event.name?.startsWith(p));

      if (!isInternal) {
        // Forward unknown custom events directly — guaranteed path
        console.log(`[agent] custom event → middleware: ${event.name}`);
        this.subscriber.next(event);
        return true;
      }
    }

    return super.dispatchEvent(event);
  }
}

// 1. Define the agent connection to LangGraph
const defaultAgent = new CustomEventForwardingAgent({
  deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || "http://localhost:8123",
  graphId: process.env.LANGGRAPH_GRAPH_ID || "sample_agent",
  // -- Auth: uncomment whichever ZoomInfo needs --
  // langsmithApiKey: process.env.LANGSMITH_API_KEY,  // if LangGraph Cloud
  // propertyHeaders: {                               // if self-hosted
  //   "Authorization": `Bearer ${process.env.ZOOMINFO_AUTH_TOKEN}`,
  //   // "x-api-key": process.env.ZOOMINFO_API_KEY,
  // },
});

// 2. Bind in middleware to the agent. For A2UI and MCP Apps.
defaultAgent.use(...aguiMiddleware);

// 3. Define the route and CopilotRuntime for the agent
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    endpoint: "/api/copilotkit",
    serviceAdapter: new ExperimentalEmptyAdapter(),
    runtime: new CopilotRuntime({
      agents: {
        default: defaultAgent,
      },
    }),
  });

  return handleRequest(req);
};
