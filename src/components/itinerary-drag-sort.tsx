"use client";

import { useRef, useState } from "react";

export function ItineraryDragSort({
  action,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const draggedIdRef = useRef<string | null>(null);
  const [message, setMessage] = useState("");

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    const item = findItemElement(event.target);

    if (!item) {
      return;
    }

    draggedIdRef.current = item.dataset.itineraryItemId ?? null;
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (draggedIdRef.current && findItemElement(event.target)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const draggedId = draggedIdRef.current;
    const target = findItemElement(event.target);

    draggedIdRef.current = null;

    if (!draggedId || !target?.dataset.itineraryItemId) {
      return;
    }

    const container = event.currentTarget;
    const dragged = container.querySelector<HTMLElement>(
      `[data-itinerary-item-id="${CSS.escape(draggedId)}"]`,
    );

    if (!dragged || dragged === target) {
      return;
    }

    container.insertBefore(dragged, target);
    const orderedIds = Array.from(
      container.querySelectorAll<HTMLElement>("[data-itinerary-item-id]"),
    )
      .map((item) => item.dataset.itineraryItemId)
      .filter((id): id is string => Boolean(id));

    if (inputRef.current) {
      inputRef.current.value = orderedIds.join(",");
    }

    setMessage("正在保存拖拽排序...");
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form action={action} className="hidden" ref={formRef}>
        <input name="orderedItemIds" ref={inputRef} type="hidden" />
      </form>
      {message ? (
        <p className="mb-3 rounded-md border border-[#b8d8ca] bg-[#edf4f1] px-3 py-2 text-sm text-[#2f6f73]">
          {message}
        </p>
      ) : null}
      <div
        className="space-y-3"
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
      >
        {children}
      </div>
    </>
  );
}

function findItemElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-itinerary-item-id]")
    : null;
}
