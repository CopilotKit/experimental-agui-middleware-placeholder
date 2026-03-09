/**
 * ZoomInfo SSE Agent — Single-Connection Approach
 *
 * Instead of CopilotKit making its own connection to ZoomInfo's LangGraph agent,
 * this agent reads from ZoomInfo's existing SSE stream and translates events
 * to AG-UI format.
 *
 * Two approaches shown:
 *
 * 1. ZoomInfoLangGraphSSEAgent — If ZoomInfo's SSE carries raw LangGraph events
 *    (on_chat_model_stream, on_tool_end, etc.), we subclass LangGraphAgent and
 *    reuse its handleSingleEvent() which already does all the translation.
 *
 * 2. ZoomInfoCustomSSEAgent — If ZoomInfo's SSE carries their own custom event
 *    format (they built their own scaffolding), we extend AbstractAgent and
 *    map manually.
 *
 * We won't know which applies until the deep-dive call. Both are here as
 * starting points.
 */

import {
  AbstractAgent,
  EventType,
  type RunAgentInput,
  type BaseEvent,
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type StateSnapshotEvent,
  type CustomEvent,
  type RunStartedEvent,
  type RunFinishedEvent,
} from "@ag-ui/client";
import {
  LangGraphAgent,
  type ProcessedEvents,
  type LangGraphAgentConfig,
} from "@ag-ui/langgraph";
import { Observable, Subscriber } from "rxjs";

// ---------------------------------------------------------------------------
// Approach 1: ZoomInfo's SSE sends raw LangGraph events
// ---------------------------------------------------------------------------
// If their SSE events look like:
//   data: {"event":"on_chat_model_stream","data":{"chunk":{"content":"Hello",...}}}
//
// Then we can reuse LangGraphAgent's handleSingleEvent() which already
// translates on_chat_model_stream, on_tool_end, on_custom_event, etc.
// into AG-UI events. We just override the stream source.
// ---------------------------------------------------------------------------

export interface ZoomInfoLangGraphSSEConfig extends LangGraphAgentConfig {
  /** ZoomInfo's SSE endpoint that streams raw LangGraph events */
  zoomInfoSSEUrl: string;
}

export class ZoomInfoLangGraphSSEAgent extends LangGraphAgent {
  private zoomInfoSSEUrl: string;

  constructor(config: ZoomInfoLangGraphSSEConfig) {
    super(config);
    this.zoomInfoSSEUrl = config.zoomInfoSSEUrl;
  }

  /**
   * Override run() to consume ZoomInfo's existing SSE instead of
   * creating a new LangGraph Cloud connection.
   *
   * handleSingleEvent() is inherited from LangGraphAgent and does
   * all the LangGraph → AG-UI translation for us.
   */
  run(input: RunAgentInput): Observable<ProcessedEvents> {
    return new Observable<ProcessedEvents>((subscriber) => {
      this.subscriber = subscriber;

      // Initialize run state (handleSingleEvent depends on this)
      this.activeRun = {
        id: input.runId,
        threadId: input.threadId,
        hasFunctionStreaming: false,
      };

      subscriber.next({
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as RunStartedEvent);

      // Connect to ZoomInfo's existing SSE
      const eventSource = new EventSource(this.zoomInfoSSEUrl);

      eventSource.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);

          // If the SSE carries the LangGraph event envelope:
          // { event: "on_chat_model_stream", data: { chunk: { content: "..." } } }
          if (parsed.event && parsed.data) {
            // Feed directly into LangGraphAgent's translation pipeline
            this.handleSingleEvent(parsed.data);
          }
        } catch (err) {
          console.error("[zoominfo-sse] failed to parse event:", err);
        }
      };

      eventSource.addEventListener("done", () => {
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        } as RunFinishedEvent);
        subscriber.complete();
        eventSource.close();
      });

      eventSource.onerror = (err) => {
        subscriber.error(err);
        eventSource.close();
      };

      return () => eventSource.close();
    });
  }
}

// ---------------------------------------------------------------------------
// Approach 2: ZoomInfo's SSE sends their own custom event format
// ---------------------------------------------------------------------------
// If their SSE events look something like:
//   data: {"type":"text_delta","content":"Hello","id":"msg-123"}
//   data: {"type":"tool_call","name":"search","args":{...},"id":"tc-456"}
//   data: {"type":"canvas_update","html":"<div>...</div>"}
//
// Then we need to map manually. No LangGraph translation to reuse.
// ---------------------------------------------------------------------------

interface ZoomInfoCustomSSEConfig {
  /** ZoomInfo's SSE endpoint */
  sseUrl: string;
}

export class ZoomInfoCustomSSEAgent extends AbstractAgent {
  private sseUrl: string;

  constructor(config: ZoomInfoCustomSSEConfig) {
    // AbstractAgent requires an AgentConfig with at minimum a description
    super({} as any);
    this.sseUrl = config.sseUrl;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      subscriber.next({
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as RunStartedEvent);

      const eventSource = new EventSource(this.sseUrl);

      eventSource.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data);
          // -----------------------------------------------------------
          // Map ZoomInfo's events to AG-UI events.
          // These event names are PLACEHOLDERS — replace with whatever
          // ZoomInfo's actual SSE event format looks like.
          // -----------------------------------------------------------
          this.handleZoomInfoEvent(event, subscriber);
        } catch (err) {
          console.error("[zoominfo-sse] parse error:", err);
        }
      };

      eventSource.addEventListener("done", () => {
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        } as RunFinishedEvent);
        subscriber.complete();
        eventSource.close();
      });

      eventSource.onerror = (err) => {
        subscriber.error(err);
        eventSource.close();
      };

      return () => eventSource.close();
    });
  }

  /**
   * Translate a single ZoomInfo SSE event into AG-UI event(s).
   *
   * TODO: Replace these placeholder event names with ZoomInfo's actual
   * event types once we see their SSE format in the deep-dive call.
   */
  private handleZoomInfoEvent(
    event: any,
    subscriber: Subscriber<BaseEvent>,
  ) {
    switch (event.type) {
      // -- Text streaming --
      case "text_start":
        subscriber.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId: event.id,
          role: "assistant",
        } as TextMessageStartEvent);
        break;

      case "text_delta":
        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: event.id,
          delta: event.content,
        } as TextMessageContentEvent);
        break;

      case "text_end":
        subscriber.next({
          type: EventType.TEXT_MESSAGE_END,
          messageId: event.id,
        } as TextMessageEndEvent);
        break;

      // -- Tool calls --
      case "tool_call_start":
        subscriber.next({
          type: EventType.TOOL_CALL_START,
          toolCallId: event.id,
          toolCallName: event.name,
        } as ToolCallStartEvent);
        break;

      case "tool_call_args":
        subscriber.next({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: event.id,
          delta: event.args,
        } as ToolCallArgsEvent);
        break;

      case "tool_call_end":
        subscriber.next({
          type: EventType.TOOL_CALL_END,
          toolCallId: event.id,
        } as ToolCallEndEvent);
        break;

      case "tool_call_result":
        subscriber.next({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: event.id,
          content: event.result,
          role: "tool",
        } as ToolCallResultEvent);
        break;

      // -- State --
      case "state_update":
        subscriber.next({
          type: EventType.STATE_SNAPSHOT,
          snapshot: event.state,
        } as StateSnapshotEvent);
        break;

      // -- Canvas / custom ZoomInfo events --
      case "canvas_update":
        // Forward as AG-UI custom event — CopilotKit middleware or
        // frontend can handle it however makes sense
        subscriber.next({
          type: EventType.CUSTOM,
          name: "canvas_update",
          value: event,
        } as CustomEvent);
        break;

      default:
        // Forward unknown events as custom events so nothing is lost
        subscriber.next({
          type: EventType.CUSTOM,
          name: event.type,
          value: event,
        } as CustomEvent);
        break;
    }
  }
}
