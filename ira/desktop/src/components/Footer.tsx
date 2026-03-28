import React from "react";
import ExoraLogo from "../../../assets/exora_logo.svg";

const COLORS = {
  power: "#FF6B6B",
};

export default function Footer({ onPower }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
      {/* Power Button */}
      <button
        style={{
          width: 28,
          height: 28,
          border: "none",
          background: "none",
          color: COLORS.power,
          fontSize: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          cursor: "pointer",
        }}
        aria-label="Power"
        onClick={onPower}
      >
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 3V15" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M7.05 7.05A10 10 0 1 0 20.95 7.05" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </button>
      {/* Xora Logo */}
      <img
        src={ExoraLogo}
        alt="Xora Logo"
        style={{ width: 32, height: 32, borderRadius: "50%", marginLeft: "auto", objectFit: "cover" }}
      />
    </div>
  );
}
