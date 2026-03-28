import React from "react";

const COLORS = {
  innerBox: "#E59898",
  primary: "#1A1A1A",
};

export default function ResponseContentBox({
  title,
  body,
  loading,
  error,
}) {
  return (
    <div style={{
      borderRadius: 16,
      background: COLORS.innerBox,
      padding: 18,
      minHeight: 220,
    }}>
      {loading ? (
        <div style={{ color: COLORS.primary, fontSize: 13 }}>Generating response...</div>
      ) : error ? (
        <div style={{ color: "#b00020", fontSize: 13 }}>{error}</div>
      ) : (
        <>
          {title && (
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 10,
              color: COLORS.primary,
            }}>
              {title}
            </div>
          )}
          <div style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: COLORS.primary,
            textTransform: "uppercase",
          }}>
            {body}
          </div>
        </>
      )}
    </div>
  );
}
