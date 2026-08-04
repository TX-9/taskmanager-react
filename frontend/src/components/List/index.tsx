// Pattern: generic List<T> component (TypeScript + Performance sections).
// Reused for the task list today and any future list (e.g. an activity feed)
// tomorrow — callers supply `items`, a `keyExtractor`, and a `renderItem`
// render-prop, and the component decides internally whether to virtualize.
//
// Pattern: virtualization with @tanstack/react-virtual — once `items` exceeds
// VIRTUALIZE_THRESHOLD, only the rows in (and near) the viewport are mounted,
// so a 1,000-task list costs roughly the same render time as a 20-task one.

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const VIRTUALIZE_THRESHOLD = 100;
const ESTIMATED_ROW_HEIGHT_PX = 88;

export interface ListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  emptyState?: ReactNode;
  className?: string;
}

function List<T>({ items, keyExtractor, renderItem, emptyState, className }: ListProps<T>): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = items.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT_PX,
    overscan: 8,
    enabled: shouldVirtualize,
  });

  if (items.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-400">{emptyState ?? "No items."}</div>;
  }

  if (!shouldVirtualize) {
    return (
      <div className={`flex flex-col gap-3 ${className ?? ""}`}>
        {items.map((item) => (
          // renderItem() is a plain JS call — it returns a JSX description object
          // ({ type, props }) but does not render anything. React reconciles after
          // List finishes: it walks the returned tree, finds each element, and
          // compares props against the mounted instance. Only at that point does
          // React.memo on the returned component type decide whether to re-render.
          <div key={keyExtractor(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className={`max-h-[calc(100vh-220px)] overflow-y-auto ${className ?? ""}`}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) {
            return null;
          }
          return (
            <div
              key={keyExtractor(item)}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: "0.75rem",
              }}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default List;
