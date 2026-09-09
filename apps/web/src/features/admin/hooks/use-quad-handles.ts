import type { ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import type { Point } from "@openrift/shared/scan/types";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";

import { clampQuad, imageToDisplayScale } from "@/features/admin/lib/straighten-quad";

interface DisplayBox {
  left: number;
  top: number;
  width: number;
}

export function pointerToImagePoint(
  clientX: number,
  clientY: number,
  box: DisplayBox,
  naturalWidth: number,
): Point {
  const scale = imageToDisplayScale(naturalWidth, box.width);
  return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale };
}

export type QuadCorner = 0 | 1 | 2 | 3;

export const QUAD_CORNERS: readonly QuadCorner[] = [0, 1, 2, 3];

export function moveQuadCorner(quad: ImageQuad, corner: QuadCorner, point: Point): ImageQuad {
  const next: ImageQuad = [{ ...quad[0] }, { ...quad[1] }, { ...quad[2] }, { ...quad[3] }];
  next[corner] = point;
  return next;
}

export function useQuadHandles({
  quad,
  width,
  height,
  onChange,
}: {
  quad: ImageQuad;
  width: number;
  height: number;
  onChange: (next: ImageQuad) => void;
}) {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [draggingCorner, setDraggingCorner] = useState<number | null>(null);

  function dragTo(corner: QuadCorner, event: ReactPointerEvent<SVGElement>): void {
    const surface = surfaceRef.current;
    if (surface === null) {
      return;
    }
    const box = surface.getBoundingClientRect();
    const point = pointerToImagePoint(event.clientX, event.clientY, box, width);
    onChange(clampQuad(moveQuadCorner(quad, corner, point), width, height));
  }

  function handleProps(corner: QuadCorner) {
    return {
      onPointerDown: (event: ReactPointerEvent<SVGElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraggingCorner(corner);
        dragTo(corner, event);
      },
      onPointerMove: (event: ReactPointerEvent<SVGElement>) => {
        if (draggingCorner === corner) {
          dragTo(corner, event);
        }
      },
      onPointerUp: (event: ReactPointerEvent<SVGElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDraggingCorner(null);
      },
      onPointerCancel: () => setDraggingCorner(null),
    };
  }

  return { surfaceRef, draggingCorner, handleProps };
}
