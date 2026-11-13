
export default function ExplainModal({
    title,
    emoji,
    lines,
    onClose,
    onProceed,
    proceedLabel = "Proceed",
  }) {
    return (
      <div style={M.overlay}>
        <div style={M.box}>
          <div style={M.emoji}>{emoji}</div>
          <div style={M.title}>{title}</div>
  
          <div style={M.lines}>
            {lines.map((line, index) => (
              <div key={index} style={M.line}>
                <span style={M.dot}>•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
  
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={M.cancelBtn} onClick={onClose}>
              ← Go Back
            </button>
  
            {onProceed && (
              <button style={M.proceedBtn} onClick={onProceed}>
                {proceedLabel} →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  const M = {
    overlay: {
      position: "fixed",
      inset: 0,
      background: "#000000cc",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    box: {
      background: "#1a1a35",
      borderRadius: 20,
      padding: 28,
      maxWidth: 460,
      width: "100%",
      border: "1px solid #ffffff15",
    },
    emoji: {
      fontSize: 40,
      textAlign: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: 800,
      color: "#fff",
      textAlign: "center",
      marginBottom: 16,
    },
    lines: {
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    line: {
      display: "flex",
      gap: 10,
      fontSize: 14,
      color: "#ccc",
      lineHeight: 1.5,
    },
    dot: {
      color: "#E8956D",
      fontWeight: 700,
      flexShrink: 0,
    },
    cancelBtn: {
      flex: 1,
      padding: "12px",
      background: "transparent",
      border: "1px solid #444",
      color: "#888",
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: "DM Sans, sans-serif",
      fontWeight: 600,
      fontSize: 14,
    },
    proceedBtn: {
      flex: 1,
      padding: "12px",
      background: "linear-gradient(135deg,#E8956D,#B96DE8)",
      border: "none",
      color: "#fff",
      borderRadius: 10,
      cursor: "pointer",
      fontFamily: "DM Sans, sans-serif",
      fontWeight: 700,
      fontSize: 14,
    },
  };
  