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

type ExtractObservableType<T> = T extends Observable<infer U> ? U : never;
type RunNextWithStateReturn = ReturnType<Middleware["runNextWithState"]>;
export type EventWithState = ExtractObservableType<RunNextWithStateReturn>;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export interface PlaceholderMiddlewareConfig {
  // Add config options here as needed.
}

export class PlaceholderMiddleware extends Middleware {
  private config: PlaceholderMiddlewareConfig;

  constructor(config: PlaceholderMiddlewareConfig = {}) {
    super();
    this.config = config;
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let heldRunFinished: EventWithState | null = null;
      let eventCount = 0;

      const subscription = this.runNextWithState(input, next).subscribe({
        next: ({ event, messages, state }) => {
          eventCount++;
          console.log(`[middleware] #${eventCount} ${event.type}`);

          if (heldRunFinished) {
            subscriber.next(heldRunFinished.event);
            heldRunFinished = null;
          }

          if (event.type === EventType.RUN_FINISHED) {
            heldRunFinished = { event, messages, state };
            return;
          }

          // --- transform / inspect events here ---

          subscriber.next(event);
        },

        error: (err) => {
          console.error("[middleware] error:", err);
          if (heldRunFinished) {
            subscriber.next(heldRunFinished.event);
            heldRunFinished = null;
          }
          subscriber.error(err);
        },

        complete: () => {
          console.log(`[middleware] done — ${eventCount} events`);
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
