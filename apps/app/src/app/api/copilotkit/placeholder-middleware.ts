import {
  Middleware,
  type RunAgentInput,
  type AbstractAgent,
  type BaseEvent,
  type Tool,
  type Message,
  type ToolCall,
  type RunStartedEvent,
  type RunFinishedEvent,
  type RunErrorEvent,
  type StepStartedEvent,
  type StepFinishedEvent,
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type StateSnapshotEvent,
  type StateDeltaEvent,
  type MessagesSnapshotEvent,
  type CustomEvent,
  type RawEvent,
  EventType,
} from "@ag-ui/client";
import { Observable } from "rxjs";

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/**
 * Extract the EventWithState type from Middleware.runNextWithState's return.
 * (Not directly exported from @ag-ui/client.)
 */
type ExtractObservableType<T> = T extends Observable<infer U> ? U : never;
type RunNextWithStateReturn = ReturnType<Middleware["runNextWithState"]>;
export type EventWithState = ExtractObservableType<RunNextWithStateReturn>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PlaceholderMiddlewareConfig {
  // Add config options here as needed.
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Placeholder middleware — intercepts the AG-UI event stream and forwards
 * all events unchanged.
 *
 * Use this as a starting point for building custom middleware that needs to
 * transform raw events emitted by the agent (e.g. LangGraph / LangChain)
 * into other AG-UI events.
 *
 * Two helper methods from the base `Middleware` class:
 *
 *   • `this.runNext(input, next)`          – plain passthrough
 *   • `this.runNextWithState(input, next)` – passthrough that also tracks
 *                                            accumulated messages & state
 */
export class PlaceholderMiddleware extends Middleware {
  private config: PlaceholderMiddlewareConfig;

  constructor(config: PlaceholderMiddlewareConfig = {}) {
    super();
    this.config = config;
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    return this.processStream(this.runNextWithState(input, next));
  }

  // -----------------------------------------------------------------------
  // Event processing
  // -----------------------------------------------------------------------

  /**
   * Core event-processing pipeline.
   *
   * Wraps the upstream Observable<EventWithState> and gives you a per-event
   * hook where you can transform, suppress, or inject new events.
   *
   * The `subscriber.next(event)` call is what actually emits the event
   * downstream — skip it to swallow an event, or call it multiple times to
   * inject additional events.
   */
  private processStream(
    source: Observable<EventWithState>,
  ): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let heldRunFinished: EventWithState | null = null;

      const subscription = source.subscribe({
        next: (eventWithState) => {
          const { event, messages, state } = eventWithState;

          // If we previously held back a RUN_FINISHED and something else
          // arrived, flush it now before emitting the new event.
          if (heldRunFinished) {
            subscriber.next(heldRunFinished.event);
            heldRunFinished = null;
          }

          // Hold RUN_FINISHED until the stream completes so we can inject
          // events before the run officially ends.
          if (event.type === EventType.RUN_FINISHED) {
            heldRunFinished = eventWithState;
            return;
          }

          // -----------------------------------------------------------------
          // Per-event handling — add your transformations here.
          //
          // You can narrow the event type by switching on `event.type`:
          //
          //   switch (event.type) {
          //     case EventType.RUN_STARTED:
          //     case EventType.RUN_FINISHED:
          //     case EventType.RUN_ERROR:
          //     case EventType.STEP_STARTED:
          //     case EventType.STEP_FINISHED:
          //     case EventType.TEXT_MESSAGE_START:
          //     case EventType.TEXT_MESSAGE_CONTENT:
          //     case EventType.TEXT_MESSAGE_END:
          //     case EventType.TOOL_CALL_START:
          //     case EventType.TOOL_CALL_ARGS:
          //     case EventType.TOOL_CALL_END:
          //     case EventType.TOOL_CALL_RESULT:
          //     case EventType.STATE_SNAPSHOT:
          //     case EventType.STATE_DELTA:
          //     case EventType.MESSAGES_SNAPSHOT:
          //     case EventType.RAW:
          //     case EventType.CUSTOM:
          //   }
          //
          // `messages` and `state` reflect the accumulated state *after*
          // this event has been applied.
          // -----------------------------------------------------------------

          subscriber.next(event);
        },

        error: (err) => {
          if (heldRunFinished) {
            subscriber.next(heldRunFinished.event);
            heldRunFinished = null;
          }
          subscriber.error(err);
        },

        complete: () => {
          // ---------------------------------------------------------------
          // Stream ended. If we're holding a RUN_FINISHED, this is your
          // chance to emit extra events (e.g. synthetic tool-call results)
          // before flushing it.
          //
          // Example:
          //   if (heldRunFinished) {
          //     const { messages, state } = heldRunFinished;
          //     // ... inspect messages/state, emit new events ...
          //     subscriber.next(heldRunFinished.event);
          //   }
          // ---------------------------------------------------------------

          if (heldRunFinished) {
            subscriber.next(heldRunFinished.event);
            heldRunFinished = null;
          }
          subscriber.complete();
        },
      });

      return () => subscription.unsubscribe();
    });
  }
}

export const placeholderMiddleware = new PlaceholderMiddleware();
