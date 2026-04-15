import React from "react";
import { theme } from "../theme";

export default function ResponseContentBox({
  title,
  body,
  loading,
  error,
}: {
  title?: string;
  body?: string;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div
      style={{
        borderRadius: 8,
        background: theme.bgPanel,
        border: `1px solid ${theme.border}`,
        padding: 16,
        minHeight: 220,
        fontFamily: theme.fontMono,
        fontSize: 13,
      }}
    >
      {loading ? (
        <div style={{ color: theme.orange }}>$ generating…</div>
      ) : error ? (
        <div style={{ color: theme.red }}>{error}</div>
      ) : (
        <>
          {title && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 10,
                color: theme.green,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {title}
            </div>
          )}
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: theme.text,
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </div>
        </>
      )}
    </div>
  );
}
