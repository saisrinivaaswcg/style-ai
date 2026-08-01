import { useState, useEffect } from "react";
import Exa from "exa-js";

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
      padding: "7px 10px", borderRadius: 8, fontSize: 13,
      background: needsUpcycling ? "#FFF8E1" : "#F7F7F7",
      border: `0.5px solid ${needsUpcycling ? "#FFD54F" : "#E8E8E8"}`,
    }}>
      <ColorDot color={item.color} />
      <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
      <span style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.category}</span>
      {needsUpcycling && <span style={{ fontSize: 12, color: "#F59E0B" }}>♻</span>}
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

  const s = {
    app: { maxWidth: 700, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif", color: "#1a1a1a", paddingBottom: 48 },
    header: { padding: "28px 20px 20px", borderBottom: "0.5px solid #E8E8E8" },
    headerTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    logo: { display: "flex", alignItems: "center", gap: 10 },
    logoIcon: { width: 32, height: 32, background: "#1a1a1a", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 },
    logoName: { fontSize: 18, fontWeight: 600, letterSpacing: "-0.3px" },
    tagline: { fontSize: 13, color: "#999", marginLeft: 42 },
    addBtn: { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: "0.5px solid #D0D0D0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" },
    uploadPanel: { padding: "16px 20px", borderBottom: "0.5px solid #E8E8E8" },
    uploadArea: { border: "1.5px dashed #D0D0D0", borderRadius: 12, padding: 24, textAlign: "center", cursor: "pointer", background: "#FAFAFA" },
    controls: { padding: "14px 20px", display: "flex", gap: 10, alignItems: "flex-end", borderBottom: "0.5px solid #E8E8E8" },
    field: { flex: 1 },
    label: { display: "block", fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 5 },
    select: { width: "100%", padding: "8px 10px", border: "0.5px solid #D0D0D0", borderRadius: 8, fontSize: 14, background: "#fff", cursor: "pointer" },
    suggestBtn: { padding: "9px 20px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
    content: { padding: 20 },
    sectionLabel: { fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 },
    card: { background: "#fff", border: "0.5px solid #E8E8E8", borderRadius: 12, padding: 16, marginBottom: 10 },
    cardName: { fontSize: 15, fontWeight: 600, marginBottom: 3 },
    cardReason: { fontSize: 12, color: "#888", marginBottom: 10, lineHeight: 1.5 },
    itemsList: { display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 },
    actionRow: { display: "flex", gap: 8 },
    actionBtn: { flex: 1, padding: "8px 0", background: "#F7F7F7", border: "0.5px solid #E0E0E0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" },
    dangerBtn: { flex: 1, padding: "8px 0", background: "#FFF0F0", border: "0.5px solid #FFCDD2", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#C62828" },
    upcycleCard: { background: "#F1F8E9", border: "0.5px solid #C5E1A5", borderRadius: 12, padding: 14, marginBottom: 10 },
    chip: { fontSize: 11, padding: "3px 9px", background: "#fff", border: "0.5px solid #E0E0E0", borderRadius: 20, color: "#888" },
    donateBanner: { background: "#E3F2FD", border: "0.5px solid #90CAF9", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "#1565C0", marginTop: 10 },
    backBtn: { width: "100%", padding: "9px 0", border: "0.5px solid #E0E0E0", borderRadius: 8, background: "transparent", fontSize: 13, color: "#888", cursor: "pointer", marginTop: 10 },
    alert: { margin: "12px 20px", padding: "10px 14px", background: "#FFF8E1", border: "0.5px solid #FFD54F", borderRadius: 8, fontSize: 13, color: "#E65100" },
    closetSection: { padding: "0 20px" },
    divider: { height: "0.5px", background: "#E8E8E8", margin: "20px 0" },
    loading: { textAlign: "center", padding: "40px 0", color: "#999", fontSize: 14 },
    successToast: { background: "#E8F5E9", border: "0.5px solid #A5D6A7", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#2E7D32", marginBottom: 12 },
  };

  return (
    <div style={s.app}>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerTop}>
          <div style={s.logo}>
            <div style={s.logoIcon}>👗</div>
            <span style={s.logoName}>StyleAI</span>
          </div>
          <button style={s.addBtn} onClick={() => setUploadOpen(o => !o)}>
            📷 Add clothing
          </button>
        </div>
        <p style={s.tagline}>Outfit ideas from clothes you already own</p>
      </div>

      {/* Upload panel */}
      {uploadOpen && (
        <div style={s.uploadPanel}>
          {uploadSuccess && (
            <div style={s.successToast}>✅ Added <strong>{uploadSuccess}</strong> to your closet</div>
          )}
          {uploading ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#888", fontSize: 13 }}>
              🔍 Analysing your item with AI...
            </div>
          ) : (
            <label style={s.uploadArea}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Drop a clothing photo or tap to browse</div>
              <div style={{ fontSize: 11, color: "#999" }}>Front or back — AI will identify the item</div>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
            </label>
          )}
        </div>
      )}

      {/* Upcycle alert */}
      {upcycleable.length > 0 && (
        <div style={s.alert}>
          ♻️ <strong>{upcycleable.length} item{upcycleable.length > 1 ? "s" : ""}</strong> ready to upcycle: {upcycleable.map(i => i.name).join(", ")}
        </div>
      )}

      {/* Controls */}
      <div style={s.controls}>
        <div style={s.field}>
          <label style={s.label}>Occasion</label>
          <select style={s.select} value={occasion} onChange={e => setOccasion(e.target.value)}>
            {["casual", "work", "formal", "workout"].map(o => (
              <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
        </div>
        <div style={s.field}>
          <label style={s.label}>Season</label>
          <select style={s.select} value={season} onChange={e => setSeason(e.target.value)}>
            {["summer", "winter", "spring", "autumn"].map(s => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <button style={{ ...s.suggestBtn, opacity: loading ? 0.5 : 1 }} onClick={getOutfits} disabled={loading}>
          {loading && stage === "outfits" ? "Finding..." : "✨ Suggest outfits"}
        </button>
      </div>

      {/* Error */}
      {error && <div style={{ ...s.alert, background: "#FFEBEE", borderColor: "#FFCDD2", color: "#C62828" }}>{error}</div>}

      {/* Loading */}
      {loading && (
        <div style={s.loading}>
          {stage === "outfits" && "🔍 Finding the best outfits from your closet..."}
          {stage === "restyling" && "✨ Thinking of new ways to style this..."}
          {stage === "upcycling" && "♻️ Finding a new life for this item..."}
        </div>
      )}

      {/* Outfit results */}
      {!loading && result && stage === "outfits" && (
        <div style={s.content}>
          <div style={s.sectionLabel}>Outfits for {occasion} · {season}</div>
          {(result.outfits || []).map((outfit, i) => (
            <div key={i} style={s.card}>
              <div style={s.cardName}>{outfit.name}</div>
              <div style={s.cardReason}>{outfit.reason}</div>
              {outfit.imageUrl && (
                <a href={outfit.imageUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", fontSize: 12, color: "#4A90D9", marginBottom: 10 }}>
                  🖼 View outfit inspiration →
                </a>
              )}
              <div style={s.itemsList}>
                {(outfit.items || []).map(item => <ItemRow key={item.id} item={item} />)}
              </div>
              <div style={s.actionRow}>
                <button style={s.actionBtn} onClick={() => getRestyling(outfit.items?.[0])}>🔄 Restyle an item</button>
                <button style={s.dangerBtn} onClick={reset}>✕ Not for me</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restyling results */}
      {!loading && result && stage === "restyling" && selectedItem && (
        <div style={s.content}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>New ways to style</div>
            <div style={{ fontSize: 13, color: "#888" }}>Based on your <strong>{selectedItem.name}</strong></div>
          </div>
          {(result.styles || []).map((style, i) => (
            <div key={i} style={s.card}>
              <div style={s.cardName}>{style.name}</div>
              <div style={s.cardReason}>{style.description}</div>
              <div style={s.itemsList}>
                {(style.items || []).map(item => <ItemRow key={item.id} item={item} />)}
              </div>
            </div>
          ))}
          <button onClick={() => getUpcycling(selectedItem)}
            style={{ width: "100%", padding: "10px 0", background: "#E8F5E9", border: "0.5px solid #A5D6A7", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#2E7D32", marginBottom: 8 }}>
            ♻️ Still not feeling it? Upcycle it
          </button>
          <button style={s.backBtn} onClick={reset}>← Back to outfits</button>
        </div>
      )}

      {/* Upcycling results */}
      {!loading && result && stage === "upcycling" && selectedItem && (
        <div style={s.content}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Upcycle your {selectedItem.name}</div>
            <div style={{ fontSize: 13, color: "#888" }}>Give it a new life instead of throwing it away</div>
          </div>
          {(result.upcycles || []).map((u, i) => (
            <div key={i} style={s.upcycleCard}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: "#2E7D32" }}>🌿 {u.name}</div>
              <div style={{ fontSize: 13, color: "#444", marginBottom: 10, lineHeight: 1.5 }}>{u.steps}</div>
              <div style={{ display: "flex", gap: 6, marginBottom: u.tutorialUrl ? 8 : 0 }}>
                <span style={s.chip}>⏱ {u.time}</span>
                <span style={s.chip}>🔧 {u.difficulty}</span>
              </div>
              {u.tutorialUrl && (
                <a href={u.tutorialUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: "#4A90D9", display: "block" }}>
                  📖 View tutorial →
                </a>
              )}
            </div>
          ))}
          <div style={s.donateBanner}>
            🤝 Still want to let it go? Consider <strong>donating</strong> to a local charity drive.
          </div>
          <button style={s.backBtn} onClick={reset}>← Start over</button>
        </div>
      )}

      {/* Closet */}
      <div style={s.closetSection}>
        <div style={s.divider} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={s.sectionLabel}>Your closet · {closet.filter(i => i.status === "active").length} items</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {closet.filter(i => i.status === "active").map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}><ItemRow item={item} /></div>
              {item.rejection_count >= UPCYCLING_THRESHOLD && (
                <button onClick={() => getUpcycling(item)}
                  style={{ fontSize: 11, padding: "5px 10px", background: "#E8F5E9", border: "0.5px solid #A5D6A7", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", color: "#2E7D32", fontWeight: 600 }}>
                  ♻️ Upcycle
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}