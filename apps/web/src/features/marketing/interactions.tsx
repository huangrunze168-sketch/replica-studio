import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

/**
 * Magnetic Button（磁吸按钮）：指针在元素上移动时，元素被轻微吸附向指针，
 * 离开后弹回原位。位移写入行内 transform；reduced-motion 由 CSS !important 兜底。
 */
export function Magnetic({
  children,
  strength = 0.3,
}: {
  children: ReactNode;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setOffset({
      x: (event.clientX - (box.left + box.width / 2)) * strength,
      y: (event.clientY - (box.top + box.height / 2)) * strength,
    });
  };

  return (
    <div
      ref={ref}
      className="magnetic"
      onPointerMove={handleMove}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {children}
    </div>
  );
}

/**
 * SVG Mask 悬停揭示：base 内容之上叠一层「隐藏彩层」，
 * 悬停时通过径向 mask 只在指针附近揭示，mask 位置实时跟随指针。
 */
export function MaskReveal({
  children,
  reveal,
  radius = 170,
}: {
  children: ReactNode;
  reveal: ReactNode;
  radius?: number;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setPos({ x: event.clientX - box.left, y: event.clientY - box.top });
  };

  const maskImage = pos
    ? `radial-gradient(${radius}px circle at ${pos.x}px ${pos.y}px, black 30%, transparent 100%)`
    : 'none';

  return (
    <div
      className="mask-reveal"
      onPointerMove={handleMove}
      onPointerLeave={() => setPos(null)}
    >
      {children}
      <div
        className="mask-reveal-layer"
        aria-hidden="true"
        style={{ WebkitMaskImage: maskImage, maskImage }}
      >
        {reveal}
      </div>
    </div>
  );
}
