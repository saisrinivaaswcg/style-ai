import { useState, useEffect } from "react";
import Exa from "exa-js";
import PaperDoll from "./PaperDoll";

const BACKEND_URL = "http://localhost:8000";
const exa = new Exa(import.meta.env.VITE_EXA_API_KEY);
const UPCYCLING_THRESHOLD = 3;

const colorMap = {
  white: "#F0F0F0", blue: "#4A90D9", black: "#2C2C2C", pink: "#F4A7B9",
  grey: "#9B9B9B", beige: "#D4B896", red: "#E05252", olive: "#7A8C45",
  navy: "#2C3E6B", yellow: "#F5C842", cream: "#F5F0DC", burgundy: "#7B2D3E",
};

function ColorDot({ color }) {
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: colorMap[color] || "#ccc", border: "1px solid #ddd",
      marginRight: 6, verticalAlign: "middle", flexShrink: 0
    }} />
  );
}

function ItemRow({ item }) {
  const needsUpcycling = item.rejection_count >= UPCYCLING_THRESHOLD;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", borderRadius: 8, fontSize: 13,
      background: needsUpcycling ? "#FFFBF0" : "#F9F9F9",
      border: `1px solid ${needsUpcycling ? "#FFE082" : "#EFEFEF"}`,
    }}>
      <ColorDot color={item.color} />
      <span style={{ flex: 1, fontWeight: 500, color: "#111" }}>{item.name}</span>
      <span style={{ fontSize: 10, color: "#BBB", textTransform: "uppercase", letterSpacing: "0.6px" }}>{item.category}</span>
      {needsUpcycling && <span style={{ fontSize: 11, color: "#D4900A" }}>♻</span>}
    </div>
  );
}

export default function App() {
  const [closet, setCloset] = useState([]);
  const [occasion, setOccasion] = useState("casual");
  const [season, setSeason] = useState("summer");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("idle");
  const [selectedItem, setSelectedItem] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [paperDollOutfit, setPaperDollOutfit] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/inventory`)
      .then(res => res.json())
      .then(data => setCloset(data))
      .catch(() => setCloset([]));
  }, []);

  const callAI = async (prompt) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a fashion stylist AI. Always respond with valid JSON only. No markdown, no backticks, no preamble." },
          { role: "user", content: prompt }
        ],
      }),
    });
    const data = await res.json();
    const text = data.choices[0].message.content;
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  };

  const searchOutfitImage = async (outfitName, items) => {
    try {
      const itemDescriptions = items.map(i => `${i.color} ${i.name}`).join(" ");
      const result = await exa.searchAndContents(
        `fashion outfit ${itemDescriptions} style look`,
        { numResults: 1, useAutoprompt: true }
      );
      return result.results[0]?.url || null;
    } catch (e) { return null; }
  };

  const searchUpcyclingTutorial = async (itemName, transformation) => {
    try {
      const result = await exa.searchAndContents(
        `how to upcycle ${itemName} into ${transformation} DIY tutorial`,
        { numResults: 1, useAutoprompt: true }
      );
      return result.results[0]?.url || null;
    } catch (e) { return null; }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BACKEND_URL}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      setCloset(prev => [...prev, data.item]);
      setUploadSuccess(data.item.name);
      setTimeout(() => setUploadSuccess(null), 3000);
    } catch (err) {
      setError("Upload failed — make sure the backend is running.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const getOutfits = async () => {
    setLoading(true); setError(null); setStage("outfits"); setSelectedItem(null);
    try {
      const activeItems = closet.filter(i => i.status === "active");
      const data = await callAI(`
Given this clothing inventory, suggest 3 complete outfit combinations for a ${occasion} occasion in ${season}.
INVENTORY: ${JSON.stringify(activeItems)}
Rules:
- Only use item IDs that exist in the inventory
- Each outfit must have at least a top or dress, and shoes
- Consider color coordination and occasion
- Prioritize items with older last_worn dates
Respond with exactly: {"outfits":[{"name":"string","item_ids":[1,2,3],"reason":"string"}]}`);
      const validIds = new Set(closet.map(i => i.id));
      data.outfits = await Promise.all((data.outfits || []).map(async (o) => {
        const items = (o.item_ids || []).filter(id => validIds.has(id)).map(id => closet.find(i => i.id === id)).filter(Boolean);
        const imageUrl = await searchOutfitImage(o.name, items);
        return { ...o, items, imageUrl };
      }));
      setResult(data);
    } catch (e) { setError("Something went wrong — try again."); }
    setLoading(false);
  };

  const getRestyling = async (item) => {
    if (!item) return;
    setLoading(true); setError(null); setStage("restyling"); setSelectedItem(item);
    try {
      const others = closet.filter(i => i.status === "active" && i.id !== item.id);
      const data = await callAI(`
Suggest 3 different ways to restyle this item using clothes the user already owns.
SELECTED ITEM: ${JSON.stringify(item)}
REST OF CLOSET: ${JSON.stringify(others)}
Respond with exactly: {"styles":[{"name":"string","item_ids":[${item.id},2],"description":"string"}]}`);
      const validIds = new Set(closet.map(i => i.id));
      data.styles = (data.styles || []).map(s => ({
        ...s,
        items: (s.item_ids || []).filter(id => validIds.has(id)).map(id => closet.find(i => i.id === id)).filter(Boolean),
      }));
      setResult(data);
    } catch (e) { setError("Something went wrong — try again."); }
    setLoading(false);
  };

  const getUpcycling = async (item) => {
    setLoading(true); setError(null); setStage("upcycling"); setSelectedItem(item);
    try {
      const data = await callAI(`
Suggest 3 specific actionable upcycling ideas for this ${item.fabric} ${item.category}.
ITEM: ${JSON.stringify(item)}
Each must be practical for daily life (tote bag, cushion cover, rag, scrunchie, etc).
Respond with exactly: {"upcycles":[{"name":"string","steps":"string","difficulty":"Easy/Medium/Hard","time":"string"}]}`);
      const upcyclesWithTutorials = await Promise.all(
        (data.upcycles || []).map(async (u) => {
          const tutorialUrl = await searchUpcyclingTutorial(item.name, u.name);
          return { ...u, tutorialUrl };
        })
      );
      data.upcycles = upcyclesWithTutorials;
      setCloset(prev => prev.map(i => i.id === item.id ? { ...i, rejection_count: i.rejection_count + 1 } : i));
      setResult(data);
    } catch (e) { setError("Something went wrong — try again."); }
    setLoading(false);
  };

  const reset = () => { setStage("idle"); setResult(null); setSelectedItem(null); setError(null); };
  const upcycleable = closet.filter(i => i.rejection_count >= UPCYCLING_THRESHOLD && i.status === "active");

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", fontFamily: "'Inter', system-ui, sans-serif", color: "#111", paddingBottom: 64, background: "#FAFAFA", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ padding: "28px 24px 20px", borderBottom: "1px solid #EFEFEF", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, background: "#111", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👗</div>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.5px" }}>StyleAI</span>
          </div>
          <button onClick={() => setUploadOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", border: "1px solid #E0E0E0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#333" }}>
            📷 Add clothing
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#AAA", marginLeft: 46 }}>Outfit ideas from clothes you already own</p>
      </div>

      {/* Upload panel */}
      {uploadOpen && (
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #EFEFEF", background: "#fff" }}>
          {uploadSuccess && (
            <div style={{ background: "#F0FFF4", border: "1px solid #B2DFDB", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#1B5E20", marginBottom: 12 }}>
              ✅ Added <strong>{uploadSuccess}</strong> to your closet
            </div>
          )}
          {uploading ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#888", fontSize: 13 }}>
              🔍 Analysing your item with AI...
            </div>
          ) : (
            <label style={{ display: "block", border: "1.5px dashed #DDD", borderRadius: 12, padding: "28px 24px", textAlign: "center", cursor: "pointer", background: "#FAFAFA" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: 13, color: "#555", marginBottom: 4, fontWeight: 500 }}>Drop a clothing photo or tap to browse</div>
              <div style={{ fontSize: 11, color: "#AAA" }}>Front or back — AI will identify the item automatically</div>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
            </label>
          )}
        </div>
      )}

      {/* Upcycle alert */}
      {upcycleable.length > 0 && (
        <div style={{ margin: "14px 24px 0", padding: "12px 16px", background: "#FFFBF0", border: "1px solid #FFE082", borderRadius: 10, fontSize: 13, color: "#7B5800" }}>
          ♻️ <strong>{upcycleable.length} item{upcycleable.length > 1 ? "s" : ""}</strong> ready to upcycle: {upcycleable.map(i => i.name).join(", ")}
        </div>
      )}

      {/* Controls */}
      <div style={{ padding: "16px 24px", display: "flex", gap: 10, alignItems: "flex-end", borderBottom: "1px solid #EFEFEF", background: "#fff", marginTop: upcycleable.length > 0 ? 14 : 0 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Occasion</label>
          <select value={occasion} onChange={e => setOccasion(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #E0E0E0", borderRadius: 8, fontSize: 14, background: "#fff", cursor: "pointer", color: "#111" }}>
            {["casual", "work", "formal", "workout"].map(o => (
              <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Season</label>
          <select value={season} onChange={e => setSeason(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #E0E0E0", borderRadius: 8, fontSize: 14, background: "#fff", cursor: "pointer", color: "#111" }}>
            {["summer", "winter", "spring", "autumn"].map(s => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <button onClick={getOutfits} disabled={loading}
          style={{ padding: "10px 22px", background: loading ? "#888" : "#111", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap", letterSpacing: "-0.2px" }}>
          {loading && stage === "outfits" ? "Finding..." : "✨ Suggest outfits"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: "14px 24px 0", padding: "12px 16px", background: "#FFF0F0", border: "1px solid #FFE0E0", borderRadius: 10, fontSize: 13, color: "#C62828" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#BBB", fontSize: 14 }}>
          {stage === "outfits" && "🔍 Finding the best outfits from your closet..."}
          {stage === "restyling" && "✨ Thinking of new ways to style this..."}
          {stage === "upcycling" && "♻️ Finding a new life for this item..."}
        </div>
      )}

      {/* Outfit results */}
      {!loading && result && stage === "outfits" && (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>
            Outfits for {occasion} · {season}
          </div>
          {(result.outfits || []).map((outfit, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #EFEFEF", borderRadius: 14, padding: "18px 18px 14px", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.2px" }}>{outfit.name}</div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>{outfit.reason}</div>
              {outfit.imageUrl && (
                <a href={outfit.imageUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 12, padding: "6px 12px", background: "#F5F8FF", border: "1px solid #DBEAFE", borderRadius: 6, fontSize: 12, color: "#1D4ED8", fontWeight: 500, textDecoration: "none" }}>
                  🖼 View outfit inspiration →
                </a>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                {(outfit.items || []).map(item => <ItemRow key={item.id} item={item} />)}
              </div>
              <button onClick={() => setPaperDollOutfit(outfit)}
                style={{ width: "100%", padding: "9px 0", background: "#F5F0FF", border: "1px solid #E8D5FF", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#6B21A8", marginBottom: 8 }}>
                👤 View on model
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => getRestyling(outfit.items?.[0])}
                  style={{ flex: 1, padding: "9px 0", background: "#F5F5F5", border: "1px solid #E8E8E8", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#333" }}>
                  🔄 Restyle an item
                </button>
                <button onClick={reset}
                  style={{ flex: 1, padding: "9px 0", background: "#FFF5F5", border: "1px solid #FFE0E0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#C62828" }}>
                  ✕ Not for me
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restyling results */}
      {!loading && result && stage === "restyling" && selectedItem && (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 3, letterSpacing: "-0.3px" }}>New ways to style</div>
            <div style={{ fontSize: 13, color: "#888" }}>Based on your <strong style={{ color: "#555" }}>{selectedItem.name}</strong></div>
          </div>
          {(result.styles || []).map((style, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #EFEFEF", borderRadius: 14, padding: "18px 18px 14px", marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{style.name}</div>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 12, lineHeight: 1.6 }}>{style.description}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(style.items || []).map(item => <ItemRow key={item.id} item={item} />)}
              </div>
            </div>
          ))}
          <button onClick={() => getUpcycling(selectedItem)}
            style={{ width: "100%", padding: "11px 0", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#15803D", marginBottom: 8, letterSpacing: "-0.2px" }}>
            ♻️ Still not feeling it? Upcycle it
          </button>
          <button onClick={reset}
            style={{ width: "100%", padding: "10px 0", border: "1px solid #E8E8E8", borderRadius: 8, background: "transparent", fontSize: 13, color: "#999", cursor: "pointer" }}>
            ← Back to outfits
          </button>
        </div>
      )}

      {/* Upcycling results */}
      {!loading && result && stage === "upcycling" && selectedItem && (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 3, letterSpacing: "-0.3px" }}>Upcycle your {selectedItem.name}</div>
            <div style={{ fontSize: 13, color: "#888" }}>Give it a new life instead of throwing it away</div>
          </div>
          {(result.upcycles || []).map((u, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #E8F5E9", borderRadius: 14, padding: "16px 18px", marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "#15803D" }}>🌿 {u.name}</div>
              <div style={{ fontSize: 13, color: "#444", marginBottom: 12, lineHeight: 1.6 }}>{u.steps}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, padding: "4px 10px", background: "#F5F5F5", border: "1px solid #ECECEC", borderRadius: 20, color: "#666" }}>⏱ {u.time}</span>
                <span style={{ fontSize: 11, padding: "4px 10px", background: "#F5F5F5", border: "1px solid #ECECEC", borderRadius: 20, color: "#666" }}>🔧 {u.difficulty}</span>
              </div>
              {u.tutorialUrl && (
                <a href={u.tutorialUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, padding: "6px 12px", background: "#F0F7FF", border: "1px solid #BBDEFB", borderRadius: 6, fontSize: 12, color: "#1565C0", fontWeight: 500, textDecoration: "none" }}>
                  📖 View tutorial →
                </a>
              )}
            </div>
          ))}
          <div style={{ background: "#F8F9FF", border: "1px solid #E3E8FF", borderRadius: 10, padding: "14px 16px", fontSize: 13, color: "#3949AB", marginTop: 4, lineHeight: 1.6 }}>
            🤝 Still want to let it go? Consider <strong>donating</strong> to a local charity drive.
          </div>
          <button onClick={reset}
            style={{ width: "100%", padding: "10px 0", border: "1px solid #E8E8E8", borderRadius: 8, background: "transparent", fontSize: 13, color: "#999", cursor: "pointer", marginTop: 10 }}>
            ← Start over
          </button>
        </div>
      )}

      {/* Closet */}
      <div style={{ padding: "0 24px" }}>
        <div style={{ height: "1px", background: "#EFEFEF", margin: "24px 0" }} />
        <div style={{ fontSize: 11, fontWeight: 600, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>
          Your closet · {closet.filter(i => i.status === "active").length} items
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {closet.filter(i => i.status === "active").map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}><ItemRow item={item} /></div>
              {item.rejection_count >= UPCYCLING_THRESHOLD && (
                <button onClick={() => getUpcycling(item)}
                  style={{ fontSize: 11, padding: "5px 12px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", color: "#15803D", fontWeight: 600 }}>
                  ♻️ Upcycle
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Paper Doll Modal */}
      {paperDollOutfit && (
        <PaperDoll
          items={paperDollOutfit.items || []}
          outfitName={paperDollOutfit.name}
          onClose={() => setPaperDollOutfit(null)}
        />
      )}
    </div>
  );
}