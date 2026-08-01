import { useState } from "react";

const colorMap = {
  white: "#F0F0F0", blue: "#4A90D9", black: "#2C2C2C", pink: "#F4A7B9",
  grey: "#9B9B9B", beige: "#D4B896", red: "#E05252", olive: "#7A8C45",
  navy: "#2C3E6B", yellow: "#F5C842", cream: "#F5F0DC", burgundy: "#7B2D3E",
};

const categoryPosition = {
  top: { top: "18%", left: "20%", width: "60%", height: "28%" },
  outerwear: { top: "14%", left: "16%", width: "68%", height: "32%" },
  dress: { top: "18%", left: "20%", width: "60%", height: "50%" },
  bottom: { top: "46%", left: "22%", width: "56%", height: "30%" },
  shoes: { top: "76%", left: "26%", width: "48%", height: "16%" },
  accessory: { top: "8%", left: "30%", width: "40%", height: "10%" },
};

function BodySilhouette() {
  return (
    <svg viewBox="0 0 200 500" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      {/* Head */}
      <ellipse cx="100" cy="45" rx="28" ry="33" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Neck */}
      <rect x="88" y="74" width="24" height="20" rx="4" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Torso */}
      <path d="M55 90 Q45 100 42 140 L42 220 Q42 230 50 232 L150 232 Q158 230 158 220 L158 140 Q155 100 145 90 Q125 82 100 82 Q75 82 55 90Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Left arm */}
      <path d="M55 95 Q38 110 32 150 Q28 170 30 190 Q32 200 40 198 Q48 196 50 186 Q52 166 56 148 Q62 118 68 102Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Right arm */}
      <path d="M145 95 Q162 110 168 150 Q172 170 170 190 Q168 200 160 198 Q152 196 150 186 Q148 166 144 148 Q138 118 132 102Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Left hand */}
      <ellipse cx="35" cy="205" rx="10" ry="14" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Right hand */}
      <ellipse cx="165" cy="205" rx="10" ry="14" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Hips */}
      <path d="M42 225 Q38 240 36 260 L164 260 Q162 240 158 225Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Left leg */}
      <path d="M42 255 Q36 280 34 320 Q32 360 34 390 Q36 400 46 400 Q56 400 58 390 Q62 360 64 320 Q68 280 68 255Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Right leg */}
      <path d="M158 255 Q164 280 166 320 Q168 360 166 390 Q164 400 154 400 Q144 400 142 390 Q138 360 136 320 Q132 280 132 255Z" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Left foot */}
      <ellipse cx="44" cy="408" rx="16" ry="10" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
      {/* Right foot */}
      <ellipse cx="156" cy="408" rx="16" ry="10" fill="#E8D5C4" stroke="#D4B896" strokeWidth="1" />
    </svg>
  );
}

function ClothingLayer({ item }) {
  const pos = categoryPosition[item.category] || categoryPosition.top;
  const color = colorMap[item.color] || "#ccc";

  if (item.image_path) {
    return (
      <div style={{
        position: "absolute",
        ...pos,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderRadius: 8,
        opacity: 0.9,
      }}>
        <img
          src={`http://localhost:8000/${item.image_path}`}
          alt={item.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
        />
        <div style={{
          display: "none", width: "100%", height: "100%",
          background: color, borderRadius: 8, opacity: 0.75,
          alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "#fff", fontWeight: 600, textAlign: "center", padding: 4
        }}>
          {item.name}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute",
      ...pos,
      background: color,
      borderRadius: 8,
      opacity: 0.8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      color: item.color === "white" || item.color === "cream" || item.color === "beige" ? "#666" : "#fff",
      fontWeight: 600,
      textAlign: "center",
      padding: 4,
    }}>
      {item.name}
    </div>
  );
}

export default function PaperDoll({ items, outfitName, onClose }) {
  const [activeItem, setActiveItem] = useState(null);

  const layerOrder = ["shoes", "bottom", "dress", "top", "outerwear", "accessory"];
  const sortedItems = [...items].sort((a, b) =>
    layerOrder.indexOf(a.category) - layerOrder.indexOf(b.category)
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: 24,
        maxWidth: 400, width: "100%", maxHeight: "90vh",
        overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.3px" }}>{outfitName}</div>
            <div style={{ fontSize: 12, color: "#AAA" }}>Tap an item to highlight</div>
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #E0E0E0", background: "#F5F5F5", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ✕
          </button>
        </div>

        {/* Model viewer */}
        <div style={{ position: "relative", width: "100%", paddingBottom: "140%", background: "#FAFAFA", borderRadius: 14, border: "1px solid #EFEFEF", marginBottom: 16 }}>
          <div style={{ position: "absolute", inset: 0, padding: "5% 15%" }}>
            <BodySilhouette />
          </div>
          {sortedItems.map(item => (
            <ClothingLayer key={item.id} item={item} />
          ))}
        </div>

        {/* Item list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sortedItems.map(item => (
            <div key={item.id}
              onClick={() => setActiveItem(activeItem?.id === item.id ? null : item)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                background: activeItem?.id === item.id ? "#F0F7FF" : "#F9F9F9",
                border: `1px solid ${activeItem?.id === item.id ? "#BBDEFB" : "#EFEFEF"}`,
                transition: "all 0.15s",
              }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                background: colorMap[item.color] || "#ccc", border: "1px solid #ddd"
              }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.name}</span>
              <span style={{ fontSize: 10, color: "#BBB", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}