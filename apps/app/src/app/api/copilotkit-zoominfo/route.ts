/**
 * Example API route for the single-connection ZoomInfo integration.
 *
 * This is an alternative to the default /api/copilotkit route.
 * Instead of CopilotKit connecting to LangGraph Cloud directly,
 * it reads from ZoomInfo's existing SSE endpoint.
 *
 * Use Approach 1 if ZoomInfo's SSE sends raw LangGraph events.
 * Use Approach 2 if ZoomInfo's SSE sends their own custom format.
 *
 * The existing /api/copilotkit route (two-connection approach) still works
 * and is simpler — this is only needed if single-connection is a hard requirement.
 */

import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { placeholderMiddleware } from "@/app/api/copilotkit/placeholder-middleware";

// -- Pick one of the two approaches: --

// Approach 1: ZoomInfo SSE carries raw LangGraph events
import { ZoomInfoLangGraphSSEAgent } from "@/app/api/copilotkit/zoominfo-sse-agent";

const agent = new ZoomInfoLangGraphSSEAgent({
  // Still need a deployment URL for LangGraphAgent's constructor,
  // but we override run() so it won't actually connect here
  deploymentUrl: process.env.ZOOMINFO_LANGGRAPH_URL || "http://localhost:8123",
  graphId: process.env.ZOOMINFO_GRAPH_ID || "zoominfo_agent",
  // This is the ZoomInfo SSE endpoint we actually read from
  zoomInfoSSEUrl:
    process.env.ZOOMINFO_SSE_URL || "http://localhost:4000/api/chat/stream",
});

// // Approach 2: ZoomInfo SSE carries their own custom event format
// import { ZoomInfoCustomSSEAgent } from "@/app/api/copilotkit/zoominfo-sse-agent";
//
// const agent = new ZoomInfoCustomSSEAgent({
//   sseUrl: process.env.ZOOMINFO_SSE_URL || "http://localhost:4000/api/chat/stream",
// }) as any; // cast needed — AbstractAgent subclass doesn't have .use()

// Apply the same middleware chain
(agent as any).use(placeholderMiddleware);

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    endpoint: "/api/copilotkit-zoominfo",
    serviceAdapter: new ExperimentalEmptyAdapter(),
    runtime: new CopilotRuntime({
      agents: {
        default: agent as any,
      },
    }),
  });

  return handleRequest(req);
};
