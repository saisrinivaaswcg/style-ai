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

function ItemBadge({ item }) {
  const needsUpcycling = item.rejection_count >= UPCYCLING_THRESHOLD;
  return (
    <div style={{
      background: needsUpcycling ? "#FFF3E0" : "#F7F7F7",
      border: `1px solid ${needsUpcycling ? "#FFB74D" : "#E8E8E8"}`,
      borderRadius: 8, padding: "8px 12px", fontSize: 12,
      display: "flex", alignItems: "center", gap: 6
    }}>
      <ColorDot color={item.color} />
      <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
      <span style={{ fontSize: 10, color: "#999", textTransform: "uppercase" }}>{item.category}</span>
      {needsUpcycling && <span>♻️</span>}
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

  useEffect(() => {
  fetch(`${BACKEND_URL}/inventory`)
    .then(res => res.json())
    .then(data => setCloset(data));
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
    const itemDescriptions = items
      .map((i) => `${i.color} ${i.name}`)
      .join(" ");
    const result = await exa.searchAndContents(
      `fashion outfit ${itemDescriptions} style look site:pinterest.com OR site:lookbook.nu OR site:polyvore.com`,
      { numResults: 1, useAutoprompt: true }
    );
    return result.results[0]?.url || null;
  } catch (e) {
    return null;
  }
};

  const searchUpcyclingTutorial = async (itemName, transformation) => {
    try {
      const result = await exa.searchAndContents(
        `how to upcycle ${itemName} into ${transformation} DIY tutorial`,
        { numResults: 1, useAutoprompt: true }
      );
      return result.results[0]?.url || null;
    } catch (e) {
      return null;
    }
  };

  const getOutfits = async () => {
    setLoading(true); setError(null); setStage("outfits"); setSelectedItem(null);
    try {
      const activeItems = closet.filter((i) => i.status === "active");
      const data = await callAI(`
Given this clothing inventory, suggest 3 complete outfit combinations for a ${occasion} occasion in ${season}.

INVENTORY:
${JSON.stringify(activeItems)}

Rules:
- Only use item IDs that exist in the inventory
- Each outfit must have at least a top or dress, and shoes
- Consider color coordination and occasion
- Prioritize items with older last_worn dates

Respond with exactly this JSON:
{"outfits":[{"name":"string","item_ids":[1,2,3],"reason":"string"}]}
      `);
      const validIds = new Set(closet.map((i) => i.id));
      data.outfits = await Promise.all((data.outfits || []).map(async (o) => {
        const items = (o.item_ids || [])
          .filter((id) => validIds.has(id))
          .map((id) => closet.find((i) => i.id === id))
          .filter(Boolean);
        const imageUrl = await searchOutfitImage(o.name, items);
        return { ...o, items, imageUrl };
      }));
      setResult(data);
    } catch (e) {
      setError("Something went wrong — try again.");
    }
    setLoading(false);
  };

  const getRestyling = async (item) => {
    if (!item) return;
    setLoading(true); setError(null); setStage("restyling"); setSelectedItem(item);
    try {
      const others = closet.filter((i) => i.status === "active" && i.id !== item.id);
      const data = await callAI(`
Suggest 3 different ways to restyle this item using clothes the user already owns.

SELECTED ITEM:
${JSON.stringify(item)}

REST OF CLOSET:
${JSON.stringify(others)}

Respond with exactly this JSON:
{"styles":[{"name":"string","item_ids":[${item.id},2],"description":"string"}]}
      `);
      const validIds = new Set(closet.map((i) => i.id));
      data.styles = (data.styles || []).map((s) => ({
        ...s,
        items: (s.item_ids || [])
          .filter((id) => validIds.has(id))
          .map((id) => closet.find((i) => i.id === id))
          .filter(Boolean),
      }));
      setResult(data);
    } catch (e) {
      setError("Something went wrong — try again.");
    }
    setLoading(false);
  };

  const getUpcycling = async (item) => {
    setLoading(true); setError(null); setStage("upcycling"); setSelectedItem(item);
    try {
      const data = await callAI(`
Suggest 3 specific actionable upcycling ideas for this ${item.fabric} ${item.category}.

ITEM:
${JSON.stringify(item)}

Each idea must be something practical for daily life (tote bag, cushion cover, rag, scrunchie, etc).

Respond with exactly this JSON:
{"upcycles":[{"name":"string","steps":"string","difficulty":"Easy/Medium/Hard","time":"string"}]}
      `);
      const upcyclesWithTutorials = await Promise.all(
        (data.upcycles || []).map(async (u) => {
          const tutorialUrl = await searchUpcyclingTutorial(item.name, u.name);
          return { ...u, tutorialUrl };
        })
      );
      data.upcycles = upcyclesWithTutorials;
      setCloset((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, rejection_count: i.rejection_count + 1 } : i
        )
      );
      setResult(data);
    } catch (e) {
      setError("Something went wrong — try again.");
    }
    setLoading(false);
  };

  const reset = () => { setStage("idle"); setResult(null); setSelectedItem(null); setError(null); };

  const upcycleable = closet.filter((i) => i.rejection_count >= UPCYCLING_THRESHOLD && i.status === "active");

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "Inter, sans-serif", color: "#1a1a1a" }}>

      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>👗 StyleAI</h1>
      <p style={{ color: "#999", fontSize: 13, margin: "4px 0 24px" }}>Outfit ideas from clothes you already own</p>

      {upcycleable.length > 0 && (
        <div style={{ background: "#FFF8E1", border: "1px solid #FFD54F", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
          ♻️ <strong>{upcycleable.length} item{upcycleable.length > 1 ? "s" : ""}</strong> ready to upcycle: {upcycleable.map((i) => i.name).join(", ")}
        </div>
      )}

      <div style={{ background: "#F7F7F7", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase" }}>Occasion</label>
            <select value={occasion} onChange={(e) => setOccasion(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, background: "#fff" }}>
              {["casual", "work", "formal", "workout"].map((o) => (
                <option key={o} value={o}>{o[0].toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase" }}>Season</label>
            <select value={season} onChange={(e) => setSeason(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD", fontSize: 14, background: "#fff" }}>
              {["summer", "winter", "spring", "autumn"].map((s) => (
                <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={getOutfits} disabled={loading}
          style={{ width: "100%", padding: "11px 0", background: loading ? "#ccc" : "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
          {loading && stage === "outfits" ? "Finding outfits…" : "✨ Suggest Outfits"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#FFEBEE", color: "#C62828", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>{error}</div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#999", fontSize: 14 }}>
          {stage === "outfits" && "🔍 Scanning your closet…"}
          {stage === "restyling" && "✨ Thinking of new looks…"}
          {stage === "upcycling" && "♻️ Finding a new life for this item…"}
        </div>
      )}

      {!loading && result && stage === "outfits" && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Outfits for {occasion} · {season}</h2>
          {(result.outfits || []).map((outfit, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{outfit.name}</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>{outfit.reason}</div>
              {outfit.imageUrl && (
                <a href={outfit.imageUrl} target="_blank" rel="noreferrer"
                  style={{ display: "block", fontSize: 12, color: "#4A90D9", marginBottom: 10 }}>
                  🖼 View outfit inspiration →
                </a>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
                {(outfit.items || []).map((item) => <ItemBadge key={item.id} item={item} />)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => getRestyling(outfit.items?.[0])}
                  style={{ flex: 1, padding: "8px 0", background: "#F0F0F0", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  🔄 Restyle an item
                </button>
                <button onClick={reset}
                  style={{ flex: 1, padding: "8px 0", background: "#FFF0F0", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#C62828" }}>
                  ✕ Not for me
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && result && stage === "restyling" && selectedItem && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>New ways to style</h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>Based on your <strong>{selectedItem.name}</strong></p>
          {(result.styles || []).map((style, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid #E8E8E8", borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{style.name}</div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>{style.description}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(style.items || []).map((item) => <ItemBadge key={item.id} item={item} />)}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <button onClick={() => getUpcycling(selectedItem)}
              style={{ padding: "10px 0", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#2E7D32" }}>
              ♻️ Still not feeling it? Upcycle it
            </button>
            <button onClick={reset}
              style={{ padding: "10px 0", background: "#F7F7F7", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {!loading && result && stage === "upcycling" && selectedItem && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>♻️ Upcycle your {selectedItem.name}</h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>Give it a new life instead of throwing it away</p>
          {(result.upcycles || []).map((u, i) => (
            <div key={i} style={{ background: "#F1F8E9", border: "1px solid #C5E1A5", borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🌿 {u.name}</div>
              <div style={{ fontSize: 13, color: "#444", marginBottom: 10 }}>{u.steps}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: u.tutorialUrl ? 10 : 0 }}>
                <span style={{ fontSize: 11, background: "#fff", border: "1px solid #C5E1A5", borderRadius: 20, padding: "3px 10px" }}>⏱ {u.time}</span>
                <span style={{ fontSize: 11, background: "#fff", border: "1px solid #C5E1A5", borderRadius: 20, padding: "3px 10px" }}>🔧 {u.difficulty}</span>
              </div>
              {u.tutorialUrl && (
                <a href={u.tutorialUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: "#4A90D9", display: "block" }}>
                  📖 View tutorial →
                </a>
              )}
            </div>
          ))}
          <div style={{ background: "#FFF8E1", border: "1px solid #FFD54F", borderRadius: 10, padding: "12px 14px", fontSize: 13, marginBottom: 10 }}>
            🤝 Still want to let it go? Consider <strong>donating</strong> to a local charity drive.
          </div>
          <button onClick={reset}
            style={{ width: "100%", padding: "10px 0", background: "#F7F7F7", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
            ← Start over
          </button>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Your Closet · {closet.filter((i) => i.status === "active").length} items
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {closet.filter((i) => i.status === "active").map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}><ItemBadge item={item} /></div>
              {item.rejection_count >= UPCYCLING_THRESHOLD && (
                <button onClick={() => getUpcycling(item)}
                  style={{ fontSize: 11, padding: "5px 10px", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", color: "#2E7D32", fontWeight: 600 }}>
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