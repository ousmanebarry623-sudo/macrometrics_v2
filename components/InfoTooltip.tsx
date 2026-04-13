"use client";
import { useState, useRef } from "react";

interface Props {
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

export default function InfoTooltip({ content, position = "top" }: Props) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const posStyle: Record<string, React.CSSProperties> = {
    top:    { bottom: "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top:    "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)" },
    left:   { right:  "calc(100% + 7px)", top: "50%",  transform: "translateY(-50%)" },
    right:  { left:   "calc(100% + 7px)", top: "50%",  transform: "translateY(-50%)" },
  };

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        width: 14, height: 14, borderRadius: "50%",
        border: "1px solid #334155", color: "#475569",
        fontSize: 9, fontWeight: 700, cursor: "help",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginLeft: 4, flexShrink: 0, userSelect: "none",
        transition: "border-color 0.15s, color 0.15s",
        ...(show ? { borderColor: "#f0c84a", color: "#f0c84a" } : {}),
      }}>?</span>

      {show && (
        <span style={{
          ...posStyle[position],
          position: "absolute",
          background: "#10101e",
          border: "1px solid #2a2a50",
          borderRadius: 8,
          padding: "9px 12px",
          fontSize: 11,
          color: "#94a3b8",
          width: 220,
          zIndex: 9999,
          whiteSpace: "normal",
          lineHeight: 1.55,
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {content}
        </span>
      )}
    </span>
  );
}
