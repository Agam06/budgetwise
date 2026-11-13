
export default function Toast({ toast }) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          background: toast.type === "error" ? "#E86D6D" : "#6DE8A3",
          color: "#0d0d1a",
          padding: "12px 24px",
          borderRadius: 30,
          fontFamily: "DM Sans, sans-serif",
          fontWeight: 700,
          fontSize: 14,
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          zIndex: 9999,
        }}
      >
        {toast.msg}
      </div>
    );
  }
  