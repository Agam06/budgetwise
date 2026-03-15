import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const USER_ID = "agam_budgetwise_user"; // fixed ID since this is a single-user app

const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food & Dining", icon: "🍜", color: "#E8956D", budget: 0 },
  { id: "electronics", name: "Electronics", icon: "💻", color: "#6D9EE8", budget: 0 },
  { id: "clothes", name: "Clothes", icon: "👗", color: "#B96DE8", budget: 0 },
  { id: "transport", name: "Transport", icon: "🚌", color: "#6DE8A3", budget: 0 },
  { id: "health", name: "Health", icon: "💊", color: "#E86D6D", budget: 0 },
  { id: "others", name: "Others", icon: "📦", color: "#E8D06D", budget: 0 },
];

const INTEREST_RATES = [
  { label: "No Interest (Friendly Borrow)", range: "₹0 – ₹50", rate: 0, description: "Like borrowing from a close friend — you just return exactly what you took. No extra charge." },
  { label: "Low (6% per year)", range: "₹50 – ₹150", rate: 6, description: "Like a loan from a cooperative bank or family member with a small fee. Very affordable." },
  { label: "Moderate (12% per year)", range: "₹150 – ₹300", rate: 12, description: "Similar to a personal loan from a good bank like SBI or HDFC. Common in real life." },
  { label: "High (18% per year)", range: "₹300 – ₹500", rate: 18, description: "Like a credit card loan. Expensive if you delay repayment — the debt grows fast." },
  { label: "Very High (24% per year)", range: "₹500 & above", rate: 24, description: "Like Buy Now Pay Later (BNPL) or a payday loan. Only use if desperate — costs a lot extra." },
];

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

function calcEMI(principal, annualRate, months) {
  if (annualRate === 0) return { emi: principal / months, totalPayable: principal, totalInterest: 0 };
  const r = annualRate / 100 / 12;
  const emi = principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
  const totalPayable = emi * months;
  return { emi: Math.round(emi), totalPayable: Math.round(totalPayable), totalInterest: Math.round(totalPayable - principal) };
}

function daysElapsed(dateStr) {
  const then = new Date(dateStr.split("/").reverse().join("-"));
  return Math.floor((new Date() - then) / (1000 * 60 * 60 * 24));
}

function getAccruedInterest(loan) {
  if (loan.annualRate === 0) return 0;
  return Math.round(loan.remainingPrincipal * (loan.annualRate / 100) * (daysElapsed(loan.takenOn) / 365));
}

// ── Explanation Modal ──
function ExplainModal({ title, emoji, lines, onClose, onProceed, proceedLabel = "Proceed" }) {
  return (
    <div style={M.overlay}>
      <div style={M.box}>
        <div style={M.emoji}>{emoji}</div>
        <div style={M.title}>{title}</div>
        <div style={M.lines}>
          {lines.map((l, i) => (
            <div key={i} style={M.line}><span style={M.dot}>•</span><span>{l}</span></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button style={M.cancelBtn} onClick={onClose}>← Go Back</button>
          {onProceed && <button style={M.proceedBtn} onClick={onProceed}>{proceedLabel} →</button>}
        </div>
      </div>
    </div>
  );
}

const M = {
  overlay: { position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  box: { background: "#1a1a35", borderRadius: 20, padding: 28, maxWidth: 460, width: "100%", border: "1px solid #ffffff15" },
  emoji: { fontSize: 40, textAlign: "center", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 16 },
  lines: { display: "flex", flexDirection: "column", gap: 10 },
  line: { display: "flex", gap: 10, fontSize: 14, color: "#ccc", lineHeight: 1.5 },
  dot: { color: "#E8956D", fontWeight: 700, flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px", background: "transparent", border: "1px solid #444", color: "#888", borderRadius: 10, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: 14 },
  proceedBtn: { flex: 1, padding: "12px", background: "linear-gradient(135deg,#E8956D,#B96DE8)", border: "none", color: "#fff", borderRadius: 10, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 14 },
};

export default function BudgetWise() {
  const isMobile = useIsMobile();
  const [screen, setScreen] = useState("dashboard");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [transactions, setTransactions] = useState([]);
  const [setupDone, setSetupDone] = useState(false);
  const [setupBudgets, setSetupBudgets] = useState({});
  const [txForm, setTxForm] = useState({ category: "", amount: "", note: "" });
  const [loans, setLoans] = useState([]);
  const [simpleBorrows, setSimpleBorrows] = useState([]);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true); // loading state while fetching from Supabase
  const [syncing, setSyncing] = useState(false); // show sync indicator
  const [loanForm, setLoanForm] = useState({ from: "", to: "", amount: "", rateIdx: 0, repayType: "", months: 3 });
  const isFirstLoad = useRef(true);

  // ── LOAD from Supabase on startup ──
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data, error } = await supabase
        .from("budgetwise_data")
        .select("*")
        .eq("user_id", USER_ID)
        .single();

      if (error || !data) {
        // No data yet — show setup screen
        setScreen("setup");
      } else {
        if (data.categories) setCategories(data.categories);
        if (data.transactions) setTransactions(data.transactions);
        if (data.loans) setLoans(data.loans);
        if (data.simple_borrows) setSimpleBorrows(data.simple_borrows);
        if (data.setup_done) setSetupDone(data.setup_done);
      }
      setLoading(false);
      isFirstLoad.current = false;
    }
    fetchData();

    // ── REALTIME SYNC — listen for changes from other devices ──
    const channel = supabase
      .channel("budgetwise_sync")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "budgetwise_data",
        filter: `user_id=eq.${USER_ID}`,
      }, (payload) => {
        const d = payload.new;
        if (!d) return;
        if (d.categories) setCategories(d.categories);
        if (d.transactions) setTransactions(d.transactions);
        if (d.loans) setLoans(d.loans);
        if (d.simple_borrows) setSimpleBorrows(d.simple_borrows);
        if (d.setup_done !== undefined) setSetupDone(d.setup_done);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── SAVE to Supabase whenever data changes ──
  useEffect(() => {
    if (isFirstLoad.current || loading) return;
    if (!setupDone) return;

    async function syncToSupabase() {
      setSyncing(true);
      const payload = {
        user_id: USER_ID,
        categories,
        transactions,
        loans,
        simple_borrows: simpleBorrows,
        setup_done: setupDone,
      };

      // Try update first, then insert if no row exists
      const { data: existing } = await supabase
        .from("budgetwise_data")
        .select("id")
        .eq("user_id", USER_ID)
        .single();

      if (existing) {
        await supabase.from("budgetwise_data").update(payload).eq("user_id", USER_ID);
      } else {
        await supabase.from("budgetwise_data").insert(payload);
      }
      setSyncing(false);
    }

    syncToSupabase();
  }, [categories, transactions, loans, simpleBorrows, setupDone]);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3200); };
  const getSpent = (id) => transactions.filter(t => t.category === id).reduce((s, t) => s + t.amount, 0);
  const getRemaining = (cat) => cat.budget - getSpent(cat.id);
  const totalBudget = categories.reduce((s, c) => s + c.budget, 0);
  const totalSpent = categories.reduce((s, c) => s + getSpent(c.id), 0);
  const pctUsed = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  const getLoansOwedBy = (catId) => loans.filter(l => l.toId === catId);
  const getLoansOwedTo = (catId) => loans.filter(l => l.fromId === catId);
  const getSimpleBorrowsOwedBy = (catId) => simpleBorrows.filter(b => b.toId === catId);
  const getSimpleBorrowsOwedTo = (catId) => simpleBorrows.filter(b => b.fromId === catId);

  // ── LOADING SCREEN ──
  if (loading) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <style>{globalCSS}</style>
        <div style={{ fontSize: 48 }}>💰</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>BudgetWise</div>
        <div style={{ fontSize: 14, color: "#888" }}>Loading your data...</div>
        <div style={S.spinner} />
      </div>
    );
  }

  // ── SETUP ──
  if (!setupDone || screen === "setup") {
    return (
      <div style={S.page}>
        <style>{globalCSS}</style>
        <div style={S.setupOuter}>
          <div style={S.setupBox}>
            <div style={S.setupHeader}>
              <span style={{ fontSize: 48 }}>💰</span>
              <h1 style={S.setupTitle}>BudgetWise</h1>
              <p style={S.setupSub}>Set your monthly budget for each category to get started</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
              {DEFAULT_CATEGORIES.map(cat => (
                <div key={cat.id} style={{ ...S.setupCard, borderColor: cat.color + "66" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{cat.icon}</div>
                  <div style={{ fontSize: 13, color: "#aaa", marginBottom: 12 }}>{cat.name}</div>
                  <div style={{ display: "flex", alignItems: "center", background: "#0d0d1a", borderRadius: 10, border: `1px solid ${cat.color}44`, overflow: "hidden" }}>
                    <span style={{ color: cat.color, fontWeight: 700, paddingLeft: 10 }}>₹</span>
                    <input style={S.setupInputField} type="number" placeholder="0"
                      value={setupBudgets[cat.id] || ""}
                      onChange={e => setSetupBudgets({ ...setupBudgets, [cat.id]: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <button style={S.gradBtn} onClick={async () => {
              const updated = DEFAULT_CATEGORIES.map(c => ({ ...c, budget: parseFloat(setupBudgets[c.id] || 0) }));
              setCategories(updated);
              setSetupDone(true);
              setScreen("dashboard");
              // Save to Supabase immediately on setup
              const payload = { user_id: USER_ID, categories: updated, transactions: [], loans: [], simple_borrows: [], setup_done: true };
              const { data: existing } = await supabase.from("budgetwise_data").select("id").eq("user_id", USER_ID).single();
              if (existing) {
                await supabase.from("budgetwise_data").update(payload).eq("user_id", USER_ID);
              } else {
                await supabase.from("budgetwise_data").insert(payload);
              }
              isFirstLoad.current = false;
              showToast("Budgets saved! Let's go 🎉");
            }}>Start Tracking →</button>
          </div>
        </div>
        {toast && <Toast toast={toast} />}
      </div>
    );
  }

  // ── SIDEBAR ──
  const sidebar = (
    <div style={S.sidebar}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>💰</span>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>BudgetWise</span>
        </div>
        {syncing && <span style={S.syncBadge}>⟳ Syncing...</span>}
        {!syncing && <span style={S.syncedBadge}>✓ Synced</span>}
      </div>
      <div style={S.sidebarSummary}>
        <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Monthly Budget</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, letterSpacing: -1 }}>₹{totalBudget.toLocaleString()}</div>
        <div style={{ fontSize: 12, marginTop: 6, marginBottom: 10 }}>
          <span style={{ color: "#E86D6D" }}>₹{totalSpent.toLocaleString()} spent</span>
          <span style={{ color: "#888" }}> · </span>
          <span style={{ color: "#6DE8A3" }}>₹{Math.max(totalBudget - totalSpent, 0).toLocaleString()} left</span>
        </div>
        <div style={S.sidebarProgressBg}>
          <div style={{ ...S.sidebarProgressFill, width: `${pctUsed}%`, background: pctUsed >= 90 ? "#E86D6D" : "linear-gradient(90deg,#E8956D,#B96DE8)" }} />
        </div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 6, textAlign: "right" }}>{Math.round(pctUsed)}% used</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {categories.map(cat => {
          const rem = getRemaining(cat);
          const pct = cat.budget > 0 ? Math.min((getSpent(cat.id) / cat.budget) * 100, 100) : 0;
          const hasLoan = getLoansOwedBy(cat.id).length > 0;
          return (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, width: 28 }}>{cat.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#ccc", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>
                  {cat.name} {hasLoan && <span style={{ fontSize: 9, background: "#E8956D33", color: "#E8956D", padding: "1px 5px", borderRadius: 4 }}>LOAN</span>}
                </div>
                <div style={{ height: 4, background: "#ffffff0f", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: rem < 0 ? "#E86D6D" : cat.color }} />
                </div>
              </div>
              <span style={{ fontSize: 12, color: rem < 0 ? "#E86D6D" : "#aaa", minWidth: 55, textAlign: "right" }}>
                {rem >= 0 ? `₹${rem.toLocaleString()}` : `-₹${Math.abs(rem).toLocaleString()}`}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <button style={S.sidebarEditBtn} onClick={() => setScreen("setup")}>⚙ Edit Budgets</button>
    </div>
  );

  // ── MAIN CONTENT ──
  const mainContent = (
    <div style={S.main}>
      <div style={isMobile ? { ...S.topbar, flexWrap: "wrap", gap: 10 } : S.topbar}>
        <div>
          <div style={S.topbarTitle}>
            {screen === "dashboard" && { overview: "Overview", transactions: "Transactions", loans: "Loans & Borrows" }[activeTab]}
            {screen === "add-tx" && "Add Expense"}
            {screen === "borrow" && "Borrow / Take Loan"}
          </div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {isMobile && syncing && <span style={{ marginLeft: 8, color: "#E8956D", fontSize: 11 }}>⟳ Syncing...</span>}
            {isMobile && !syncing && <span style={{ marginLeft: 8, color: "#6DE8A3", fontSize: 11 }}>✓ Synced</span>}
          </div>
        </div>
        {screen === "dashboard" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={S.outlineBtn} onClick={() => { setLoanForm({ from: "", to: "", amount: "", rateIdx: 0, repayType: "", months: 3 }); setScreen("borrow"); }}>💸 Borrow / Loan</button>
            <button style={S.gradBtn2} onClick={() => { setTxForm({ category: "", amount: "", note: "" }); setScreen("add-tx"); }}>+ Add Expense</button>
          </div>
        )}
      </div>

      {screen === "dashboard" && (
        <>
          <div style={S.tabs}>
            {[["overview", "📊 Overview"], ["transactions", "📋 Transactions"], ["loans", "🏦 Loans & Borrows"]].map(([t, label]) => (
              <div key={t} style={{ ...S.tab, ...(activeTab === t ? S.tabActive : {}) }} onClick={() => setActiveTab(t)}>{label}</div>
            ))}
          </div>

          {activeTab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
              {categories.map(cat => {
                const spent = getSpent(cat.id);
                const rem = cat.budget - spent;
                const pct = cat.budget > 0 ? Math.min((spent / cat.budget) * 100, 100) : 0;
                const myLoans = getLoansOwedBy(cat.id);
                const myLends = getLoansOwedTo(cat.id);
                const mySBorrows = getSimpleBorrowsOwedBy(cat.id);
                const mySLends = getSimpleBorrowsOwedTo(cat.id);
                return (
                  <div key={cat.id} style={{ ...S.catCard, borderLeft: `3px solid ${cat.color}` }}>
                    <div style={S.catCardTop}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{cat.icon}</div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{cat.name}</div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Budget: ₹{cat.budget.toLocaleString()}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: rem >= 0 ? cat.color : "#E86D6D" }}>
                          {rem >= 0 ? `₹${rem.toLocaleString()}` : `-₹${Math.abs(rem).toLocaleString()}`}
                        </div>
                        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{rem >= 0 ? "remaining" : "over budget"}</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: "#ffffff0a", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 10, transition: "width 0.5s", width: `${pct}%`, background: pct >= 90 ? "#E86D6D" : cat.color }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 10 }}>
                      <span style={{ color: "#888" }}>Spent: ₹{spent.toLocaleString()}</span>
                      <span style={{ color: "#555" }}>{Math.round(pct)}% used</span>
                    </div>
                    {rem < 0 && <div style={S.alertRed}>⚠️ Over budget — consider borrowing from another section</div>}
                    {mySBorrows.length > 0 && (
                      <div style={S.alertBlue}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>🤝 Simple Borrows (no interest)</div>
                        {mySBorrows.map(b => (
                          <div key={b.id} style={S.loanRow}>
                            <span style={{ fontSize: 12, color: "#ccc" }}>← ₹{b.amount.toLocaleString()} from {b.fromName}</span>
                            <button style={S.returnSmallBtn} onClick={() => {
                              setCategories(categories.map(c => {
                                if (c.id === b.fromId) return { ...c, budget: c.budget + b.amount };
                                if (c.id === b.toId) return { ...c, budget: c.budget - b.amount };
                                return c;
                              }));
                              setSimpleBorrows(simpleBorrows.filter(x => x.id !== b.id));
                              showToast(`₹${b.amount} returned to ${b.fromName} ✓`);
                            }}>↩ Return ₹{b.amount.toLocaleString()}</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {mySLends.length > 0 && (
                      <div style={S.alertOrange}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>💸 Lent out (no interest)</div>
                        {mySLends.map(b => (
                          <div key={b.id} style={{ fontSize: 12, color: "#ccc", marginTop: 4 }}>→ ₹{b.amount.toLocaleString()} to {b.toName} · awaiting return</div>
                        ))}
                      </div>
                    )}
                    {myLoans.map(loan => {
                      const accrued = getAccruedInterest(loan);
                      const totalNowOwed = loan.remainingPrincipal + accrued;
                      return (
                        <div key={loan.id} style={S.alertLoan}>
                          <div style={{ fontWeight: 700, marginBottom: 6, color: "#E8D06D" }}>🏦 Loan from {loan.fromName}</div>
                          <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.7 }}>
                            <div>Principal borrowed: <strong>₹{loan.principal.toLocaleString()}</strong></div>
                            <div>Remaining principal: <strong>₹{loan.remainingPrincipal.toLocaleString()}</strong></div>
                            <div>Interest accrued so far: <strong style={{ color: "#E86D6D" }}>₹{accrued.toLocaleString()}</strong></div>
                            <div>Total you owe right now: <strong style={{ color: "#E8D06D" }}>₹{totalNowOwed.toLocaleString()}</strong></div>
                            <div style={{ color: "#888" }}>Rate: {loan.annualRate}% per year · Taken on: {loan.takenOn}</div>
                            {loan.repayType === "emi" && <div style={{ color: "#6DE8A3" }}>EMI: ₹{loan.emi}/month · {loan.emiPaid}/{loan.months} paid</div>}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            {loan.repayType === "emi" && loan.emiPaid < loan.months && (
                              <button style={S.returnSmallBtn} onClick={() => {
                                setModal({
                                  title: "Pay EMI Installment", emoji: "📅",
                                  lines: [
                                    `You are paying 1 EMI of ₹${loan.emi.toLocaleString()} for your loan from ${loan.fromName}.`,
                                    "EMI means you pay a fixed amount each month until the loan is fully repaid.",
                                    `After this payment, you'll have ${loan.months - loan.emiPaid - 1} installments left.`,
                                    `₹${loan.emi} will be deducted from ${cat.name} and added back to ${loan.fromName}.`,
                                  ],
                                  proceedLabel: `Pay ₹${loan.emi} EMI`,
                                  onProceed: () => {
                                    const newPaid = loan.emiPaid + 1;
                                    const done = newPaid >= loan.months;
                                    setCategories(categories.map(c => {
                                      if (c.id === loan.fromId) return { ...c, budget: c.budget + loan.emi };
                                      if (c.id === loan.toId) return { ...c, budget: c.budget - loan.emi };
                                      return c;
                                    }));
                                    if (done) {
                                      setLoans(loans.filter(l => l.id !== loan.id));
                                      showToast(`Loan from ${loan.fromName} fully repaid! 🎉`);
                                    } else {
                                      setLoans(loans.map(l => l.id === loan.id ? { ...l, emiPaid: newPaid, remainingPrincipal: Math.max(l.remainingPrincipal - (loan.emi - getAccruedInterest(l)), 0) } : l));
                                      showToast(`EMI paid ✓ (${newPaid}/${loan.months})`);
                                    }
                                    setModal(null);
                                  }
                                });
                              }}>📅 Pay EMI ₹{loan.emi}</button>
                            )}
                            <button style={{ ...S.returnSmallBtn, borderColor: "#6DE8A355", color: "#6DE8A3" }} onClick={() => {
                              setModal({
                                title: "Repay Full Loan", emoji: "✅",
                                lines: [
                                  `You are repaying ₹${loan.remainingPrincipal.toLocaleString()} principal + ₹${accrued.toLocaleString()} interest.`,
                                  `Total repayment: ₹${totalNowOwed.toLocaleString()}.`,
                                  "Paying back early is always better — it stops more interest from piling up.",
                                  `This amount will move from ${cat.name} back to ${loan.fromName}.`,
                                ],
                                proceedLabel: `Repay ₹${totalNowOwed.toLocaleString()} Now`,
                                onProceed: () => {
                                  setCategories(categories.map(c => {
                                    if (c.id === loan.fromId) return { ...c, budget: c.budget + totalNowOwed };
                                    if (c.id === loan.toId) return { ...c, budget: c.budget - totalNowOwed };
                                    return c;
                                  }));
                                  setLoans(loans.filter(l => l.id !== loan.id));
                                  showToast(`Loan fully repaid! ₹${totalNowOwed} returned to ${loan.fromName} ✓`);
                                  setModal(null);
                                }
                              });
                            }}>✅ Repay Full</button>
                          </div>
                        </div>
                      );
                    })}
                    {myLends.map(loan => {
                      const accrued = getAccruedInterest(loan);
                      return (
                        <div key={loan.id} style={{ ...S.alertOrange, borderColor: "#E8D06D55" }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color: "#E8D06D" }}>📤 Lent to {loan.toName} (with interest)</div>
                          <div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.7 }}>
                            <div>Lent: ₹{loan.principal.toLocaleString()} · Rate: {loan.annualRate}% p.a.</div>
                            <div>Interest earned so far: <span style={{ color: "#6DE8A3" }}>+₹{accrued.toLocaleString()}</span></div>
                            <div style={{ color: "#888" }}>You'll get back ₹{(loan.remainingPrincipal + accrued).toLocaleString()} total</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "transactions" && (
            <div style={S.listBox}>
              {transactions.length === 0
                ? <div style={S.empty}>No transactions yet. Click "+ Add Expense" to begin.</div>
                : transactions.map(tx => {
                    const cat = categories.find(c => c.id === tx.category);
                    return (
                      <div key={tx.id} style={S.txRow}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: cat?.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{cat?.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.note || cat?.name}</div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{cat?.name} · {tx.date}</div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: cat?.color }}>-₹{tx.amount.toLocaleString()}</div>
                        <button style={{ background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 13, padding: 4 }}
                          onClick={() => { setTransactions(transactions.filter(t => t.id !== tx.id)); showToast("Deleted"); }}>✕</button>
                      </div>
                    );
                  })}
            </div>
          )}

          {activeTab === "loans" && (
            <div>
              {loans.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={S.sectionHead}>🏦 Active Loans (with Interest)</div>
                  <div style={S.listBox}>
                    {loans.map(loan => {
                      const accrued = getAccruedInterest(loan);
                      const totalOwed = loan.remainingPrincipal + accrued;
                      return (
                        <div key={loan.id} style={{ ...S.txRow, flexWrap: "wrap", gap: 8 }}>
                          <div style={{ width: 42, height: 42, borderRadius: 12, background: "#E8D06D22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏦</div>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{loan.fromName} → {loan.toName}</div>
                            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>₹{loan.principal.toLocaleString()} at {loan.annualRate}% p.a. · {loan.takenOn}</div>
                            <div style={{ fontSize: 12, color: "#E86D6D", marginTop: 2 }}>Interest so far: +₹{accrued.toLocaleString()}</div>
                            {loan.repayType === "emi" && <div style={{ fontSize: 12, color: "#6DE8A3", marginTop: 2 }}>EMI: ₹{loan.emi}/mo · {loan.emiPaid}/{loan.months} paid</div>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#E8D06D" }}>₹{totalOwed.toLocaleString()}</div>
                            <div style={{ fontSize: 11, color: "#666" }}>total owed now</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {simpleBorrows.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={S.sectionHead}>🤝 Simple Borrows (No Interest)</div>
                  <div style={S.listBox}>
                    {simpleBorrows.map(b => (
                      <div key={b.id} style={S.txRow}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#6DE8A322", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🤝</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{b.fromName} → {b.toName}</div>
                          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{b.date} · No interest</div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#6DE8A3" }}>₹{b.amount.toLocaleString()}</div>
                        <button style={S.returnSmallBtn} onClick={() => {
                          setCategories(categories.map(c => {
                            if (c.id === b.fromId) return { ...c, budget: c.budget + b.amount };
                            if (c.id === b.toId) return { ...c, budget: c.budget - b.amount };
                            return c;
                          }));
                          setSimpleBorrows(simpleBorrows.filter(x => x.id !== b.id));
                          showToast(`₹${b.amount} returned to ${b.fromName} ✓`);
                        }}>↩ Return</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {loans.length === 0 && simpleBorrows.length === 0 && (
                <div style={S.empty}>No active loans or borrows. Use "💸 Borrow / Loan" to get started.</div>
              )}
            </div>
          )}
        </>
      )}

      {screen === "add-tx" && (
        <div style={S.formBox}>
          <button style={S.backBtn} onClick={() => setScreen("dashboard")}>← Back</button>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 32 }}>
            <div>
              <label style={S.label}>Select Category</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {categories.map(c => (
                  <div key={c.id} style={{ ...S.chip, background: txForm.category === c.id ? c.color : "#1e1e35", borderColor: c.color, color: txForm.category === c.id ? "#000" : "#fff" }}
                    onClick={() => setTxForm({ ...txForm, category: c.id })}>{c.icon} {c.name}</div>
                ))}
              </div>
              {txForm.category && (() => {
                const cat = categories.find(c => c.id === txForm.category);
                const rem = getRemaining(cat);
                return <div style={{ ...S.remBadge, borderColor: cat.color + "55", background: cat.color + "11", marginTop: 16 }}>
                  <span style={{ color: cat.color }}>{rem >= 0 ? `₹${rem.toLocaleString()} remaining in ${cat.name}` : `⚠️ Over budget by ₹${Math.abs(rem).toLocaleString()}`}</span>
                </div>;
              })()}
            </div>
            <div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Amount (₹)</label>
                <input style={S.input} type="number" placeholder="Enter amount" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Note (optional)</label>
                <input style={S.input} type="text" placeholder="e.g. Grocery run, new shoes..." value={txForm.note} onChange={e => setTxForm({ ...txForm, note: e.target.value })} />
              </div>
              <button style={S.gradBtn} onClick={() => {
                if (!txForm.category || !txForm.amount) return showToast("Please fill all fields", "error");
                const amt = parseFloat(txForm.amount);
                if (isNaN(amt) || amt <= 0) return showToast("Enter a valid amount", "error");
                setTransactions([{ id: Date.now(), category: txForm.category, amount: amt, note: txForm.note, date: new Date().toLocaleDateString("en-IN") }, ...transactions]);
                setTxForm({ category: "", amount: "", note: "" }); setScreen("dashboard"); setActiveTab("transactions");
                showToast("Transaction added ✓");
              }}>Add Transaction</button>
            </div>
          </div>
        </div>
      )}

      {screen === "borrow" && (() => {
        const fromCat = categories.find(c => c.id === loanForm.from);
        const toCat = categories.find(c => c.id === loanForm.to);
        const amt = parseFloat(loanForm.amount) || 0;
        const selectedRate = INTEREST_RATES[loanForm.rateIdx];
        const emiCalc = amt > 0 && loanForm.repayType === "emi" ? calcEMI(amt, selectedRate.rate, loanForm.months) : null;
        return (
          <div style={S.formBox}>
            <button style={S.backBtn} onClick={() => setScreen("dashboard")}>← Back</button>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>Take money from one budget section to fund another — like a real internal loan between your own pockets.</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 32 }}>
              <div>
                <label style={S.label}>Borrow FROM</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {categories.filter(c => getRemaining(c) > 0).map(c => (
                    <div key={c.id} style={{ ...S.chip, background: loanForm.from === c.id ? c.color : "#1e1e35", borderColor: c.color, color: loanForm.from === c.id ? "#000" : "#fff" }}
                      onClick={() => setLoanForm({ ...loanForm, from: c.id })}>
                      {c.icon} {c.name}
                      <span style={{ display: "block", fontSize: 11, opacity: 0.8 }}>₹{getRemaining(c).toLocaleString()} left</span>
                    </div>
                  ))}
                </div>
                <label style={S.label}>Borrow TO</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {categories.filter(c => c.id !== loanForm.from).map(c => (
                    <div key={c.id} style={{ ...S.chip, background: loanForm.to === c.id ? c.color : "#1e1e35", borderColor: c.color, color: loanForm.to === c.id ? "#000" : "#fff" }}
                      onClick={() => setLoanForm({ ...loanForm, to: c.id })}>{c.icon} {c.name}</div>
                  ))}
                </div>
                <label style={S.label}>Amount (₹)</label>
                <input style={S.input} type="number" placeholder="Enter amount" value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} />
                {fromCat && amt > getRemaining(fromCat) && <div style={{ fontSize: 12, color: "#E86D6D", marginTop: 8 }}>⚠️ Only ₹{getRemaining(fromCat).toLocaleString()} available</div>}
              </div>
              <div>
                <label style={S.label}>Interest Rate
                  <span style={S.whatIsThis} onClick={() => setModal({ title: "What is Interest Rate?", emoji: "📈", lines: ["Interest is the extra money you pay for borrowing. Think of it as a fee for using someone else's money.", "It's shown as a % per year. So 12% means for every ₹100 you borrow, you pay ₹12 extra every year.", "The higher the rate, the more expensive the loan. 0% means you return exactly what you borrowed.", "Real banks in India charge 10–24% for personal loans."] })}>  ❓ What is this?</span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {INTEREST_RATES.map((r, i) => (
                    <div key={i} style={{ ...S.rateCard, borderColor: loanForm.rateIdx === i ? "#E8956D" : "#ffffff15", background: loanForm.rateIdx === i ? "#E8956D15" : "#1a1a2e" }}
                      onClick={() => setLoanForm({ ...loanForm, rateIdx: i })}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: loanForm.rateIdx === i ? "#E8956D" : "#fff" }}>{r.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: loanForm.rateIdx === i ? "#E8956D33" : "#ffffff0f", color: loanForm.rateIdx === i ? "#E8956D" : "#888", fontWeight: 600 }}>{r.range}</span>
                          {loanForm.rateIdx === i && <span style={{ fontSize: 11, color: "#E8956D" }}>✓</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{r.description}</div>
                    </div>
                  ))}
                </div>
                {selectedRate.rate > 0 && (
                  <>
                    <label style={S.label}>How will you repay?
                      <span style={S.whatIsThis} onClick={() => setModal({ title: "EMI vs Lump Sum", emoji: "💡", lines: ["LUMP SUM means you pay everything back at once — principal plus interest.", "EMI means you split the repayment into equal monthly payments.", "EMI is easier to manage but you pay more total due to interest each month.", "Example: Borrow ₹1000 at 12%/year for 6 months → EMI ≈ ₹172/month → Total ≈ ₹1033."] })}>  ❓ What is this?</span>
                    </label>
                    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                      {[["lumpsum", "💰 Lump Sum", "Pay all at once"], ["emi", "📅 EMI", "Pay monthly"]].map(([val, label, desc]) => (
                        <div key={val} style={{ ...S.repayCard, borderColor: loanForm.repayType === val ? "#6DE8A3" : "#ffffff15", background: loanForm.repayType === val ? "#6DE8A315" : "#1a1a2e", flex: 1 }}
                          onClick={() => setLoanForm({ ...loanForm, repayType: val })}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: loanForm.repayType === val ? "#6DE8A3" : "#fff" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {loanForm.repayType === "emi" && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={S.label}>Number of Monthly Installments</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[3, 6, 9, 12].map(m => (
                        <div key={m} style={{ ...S.monthChip, borderColor: loanForm.months === m ? "#6DE8A3" : "#333", background: loanForm.months === m ? "#6DE8A322" : "#1a1a2e", color: loanForm.months === m ? "#6DE8A3" : "#888" }}
                          onClick={() => setLoanForm({ ...loanForm, months: m })}>{m} mo</div>
                      ))}
                    </div>
                  </div>
                )}
                {fromCat && toCat && amt > 0 && (loanForm.repayType || selectedRate.rate === 0) && (
                  <div style={S.summaryCard}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#E8D06D", marginBottom: 10 }}>📋 Loan Summary</div>
                    <div style={{ fontSize: 13, color: "#ccc", lineHeight: 2 }}>
                      <div>💸 <strong>{toCat.name}</strong> borrows <strong>₹{amt.toLocaleString()}</strong> from <strong>{fromCat.name}</strong></div>
                      <div>📈 Rate: <strong>{selectedRate.rate === 0 ? "None" : `${selectedRate.rate}% per year`}</strong></div>
                      {emiCalc && <>
                        <div>📅 EMI: <strong style={{ color: "#6DE8A3" }}>₹{emiCalc.emi.toLocaleString()}</strong> × {loanForm.months} months</div>
                        <div>💰 Total payback: <strong style={{ color: "#E8956D" }}>₹{emiCalc.totalPayable.toLocaleString()}</strong></div>
                        <div>🔴 Interest: <strong style={{ color: "#E86D6D" }}>₹{emiCalc.totalInterest.toLocaleString()}</strong></div>
                      </>}
                      {selectedRate.rate === 0 && <div>✅ No interest — return exactly ₹{amt.toLocaleString()}</div>}
                    </div>
                  </div>
                )}
                <button style={{ ...S.gradBtn, marginTop: 16 }} onClick={() => {
                  if (!loanForm.from || !loanForm.to || !loanForm.amount) return showToast("Please fill all fields", "error");
                  if (amt <= 0) return showToast("Enter a valid amount", "error");
                  if (!fromCat || amt > getRemaining(fromCat)) return showToast(`Only ₹${getRemaining(fromCat)} available`, "error");
                  if (selectedRate.rate > 0 && !loanForm.repayType) return showToast("Choose a repayment method", "error");
                  const explainLines = selectedRate.rate === 0
                    ? [`${toCat.name} borrows ₹${amt.toLocaleString()} from ${fromCat.name}.`, "No interest — just return the same amount.", `${fromCat.name}'s budget decreases, ${toCat.name}'s increases.`, "Return anytime from the Overview card."]
                    : loanForm.repayType === "emi"
                    ? [`${toCat.name} borrows ₹${amt.toLocaleString()} from ${fromCat.name} at ${selectedRate.rate}% per year.`, `Repay in ${loanForm.months} monthly installments of ₹${emiCalc?.emi.toLocaleString()}.`, `Total payback: ₹${emiCalc?.totalPayable.toLocaleString()} (₹${emiCalc?.totalInterest.toLocaleString()} as interest).`, "Click 'Pay EMI' each month on the Overview card."]
                    : [`${toCat.name} borrows ₹${amt.toLocaleString()} from ${fromCat.name} at ${selectedRate.rate}% per year.`, "Lump Sum — pay back everything at once when ready.", "Interest adds up every day until you repay.", "Click 'Repay Full' on the card whenever ready."];
                  setModal({
                    title: "Confirm Loan", emoji: "🏦", lines: explainLines,
                    proceedLabel: "Confirm & Take Loan",
                    onProceed: () => {
                      const id = Date.now();
                      setCategories(categories.map(c => {
                        if (c.id === fromCat.id) return { ...c, budget: c.budget - amt };
                        if (c.id === toCat.id) return { ...c, budget: c.budget + amt };
                        return c;
                      }));
                      if (selectedRate.rate === 0) {
                        setSimpleBorrows([{ id, fromId: fromCat.id, fromName: fromCat.name, toId: toCat.id, toName: toCat.name, amount: amt, date: new Date().toLocaleDateString("en-IN") }, ...simpleBorrows]);
                      } else {
                        const ec = emiCalc || { emi: 0, totalPayable: amt, totalInterest: 0 };
                        setLoans([{ id, fromId: fromCat.id, fromName: fromCat.name, toId: toCat.id, toName: toCat.name, principal: amt, remainingPrincipal: amt, annualRate: selectedRate.rate, repayType: loanForm.repayType, months: loanForm.months, emi: ec.emi, emiPaid: 0, takenOn: new Date().toLocaleDateString("en-IN") }, ...loans]);
                      }
                      setLoanForm({ from: "", to: "", amount: "", rateIdx: 0, repayType: "", months: 3 });
                      setScreen("dashboard"); setActiveTab("loans");
                      showToast(`Loan of ₹${amt} created ✓`);
                      setModal(null);
                    }
                  });
                }}>Review & Confirm Loan</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  return (
    <div style={S.page}>
      <style>{globalCSS}</style>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #ffffff0a", background: "#111128" }}>
            <span style={{ fontWeight: 800, fontSize: 18 }}>💰 BudgetWise</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ background: "#1a1a2e", border: "1px solid #333", color: "#fff", padding: "6px 12px", borderRadius: 10, fontSize: 12, cursor: "pointer" }}
                onClick={() => { setLoanForm({ from: "", to: "", amount: "", rateIdx: 0, repayType: "", months: 3 }); setScreen("borrow"); }}>💸 Loan</button>
              <button style={{ background: "#E8956D", border: "none", color: "#000", padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                onClick={() => { setTxForm({ category: "", amount: "", note: "" }); setScreen("add-tx"); }}>+ Expense</button>
            </div>
          </div>
          {mainContent}
        </div>
      ) : (
        <div style={S.layout}>{sidebar}{mainContent}</div>
      )}
      {modal && <ExplainModal {...modal} onClose={() => setModal(null)} />}
      {toast && <Toast toast={toast} />}
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#E86D6D" : "#6DE8A3", color: "#0d0d1a", padding: "12px 24px", borderRadius: 30, fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 9999 }}>
      {toast.msg}
    </div>
  );
}

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d1a; }
  input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1a1a2e; }
  ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const S = {
  page: { minHeight: "100vh", background: "#0d0d1a", fontFamily: "DM Sans, sans-serif", color: "#f0f0f0" },
  layout: { display: "flex", minHeight: "100vh" },
  spinner: { width: 32, height: 32, border: "3px solid #333", borderTop: "3px solid #E8956D", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  sidebar: { width: 280, minHeight: "100vh", background: "#111128", borderRight: "1px solid #ffffff0a", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 0, height: "100vh", overflowY: "auto" },
  sidebarSummary: { background: "#1a1a35", borderRadius: 16, padding: 16, border: "1px solid #ffffff0a" },
  sidebarProgressBg: { height: 6, background: "#ffffff0f", borderRadius: 10, overflow: "hidden" },
  sidebarProgressFill: { height: "100%", borderRadius: 10, transition: "width 0.5s" },
  sidebarEditBtn: { background: "transparent", border: "1px solid #333", color: "#888", padding: "10px 16px", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "DM Sans, sans-serif" },
  syncBadge: { fontSize: 11, color: "#E8956D", background: "#E8956D15", padding: "3px 8px", borderRadius: 20 },
  syncedBadge: { fontSize: 11, color: "#6DE8A3", background: "#6DE8A315", padding: "3px 8px", borderRadius: 20 },
  main: { flex: 1, padding: 32, overflowY: "auto", maxHeight: "100vh" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  topbarTitle: { fontSize: 26, fontWeight: 800, letterSpacing: -0.5 },
  outlineBtn: { background: "transparent", border: "1px solid #444", color: "#ccc", padding: "10px 20px", borderRadius: 10, fontSize: 14, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 600 },
  gradBtn2: { background: "linear-gradient(135deg,#E8956D,#B96DE8)", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 14, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 700 },
  tabs: { display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" },
  tab: { padding: "10px 18px", borderRadius: 10, fontSize: 13, cursor: "pointer", background: "#1a1a2e", color: "#888", border: "1px solid #ffffff0a", fontWeight: 600 },
  tabActive: { background: "#ffffff12", color: "#fff", border: "1px solid #ffffff22" },
  catCard: { background: "#13132a", borderRadius: 16, padding: 20, border: "1px solid #ffffff08" },
  catCardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  listBox: { background: "#13132a", borderRadius: 16, border: "1px solid #ffffff08", overflow: "hidden" },
  txRow: { display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: "1px solid #ffffff06" },
  empty: { color: "#444", fontSize: 14, textAlign: "center", padding: "48px 20px" },
  sectionHead: { fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 },
  alertRed: { fontSize: 12, color: "#E86D6D", marginTop: 10, padding: "8px 12px", background: "#E86D6D11", borderRadius: 8, borderLeft: "3px solid #E86D6D" },
  alertBlue: { fontSize: 12, color: "#6D9EE8", marginTop: 10, padding: "10px 12px", background: "#6D9EE811", borderRadius: 8, borderLeft: "3px solid #6D9EE8" },
  alertOrange: { fontSize: 12, color: "#E8956D", marginTop: 10, padding: "10px 12px", background: "#E8956D11", borderRadius: 8, borderLeft: "3px solid #E8956D" },
  alertLoan: { marginTop: 10, padding: "12px", background: "#E8D06D0d", borderRadius: 10, border: "1px solid #E8D06D33" },
  loanRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 },
  returnSmallBtn: { background: "#6D9EE822", border: "1px solid #6D9EE855", color: "#6D9EE8", padding: "5px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontWeight: 700, whiteSpace: "nowrap" },
  formBox: { maxWidth: 900 },
  backBtn: { background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: 14, fontFamily: "DM Sans, sans-serif", marginBottom: 24, padding: 0 },
  label: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 10, fontWeight: 600 },
  whatIsThis: { fontSize: 11, color: "#6D9EE8", cursor: "pointer", textTransform: "none", letterSpacing: 0, fontWeight: 600, marginLeft: 8 },
  chip: { padding: "10px 14px", borderRadius: 10, border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.15s", minWidth: 100, textAlign: "center" },
  remBadge: { padding: "10px 14px", borderRadius: 10, border: "1px solid", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", background: "#1a1a2e", border: "1px solid #ffffff15", borderRadius: 10, padding: "13px 16px", color: "#fff", fontSize: 15, fontFamily: "DM Sans, sans-serif", outline: "none" },
  gradBtn: { width: "100%", padding: "14px", background: "linear-gradient(135deg,#E8956D,#B96DE8)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "DM Sans, sans-serif", boxShadow: "0 2px 16px rgba(185,109,232,0.3)" },
  rateCard: { padding: "12px 14px", borderRadius: 12, border: "1px solid", cursor: "pointer", transition: "all 0.15s" },
  repayCard: { padding: "12px 14px", borderRadius: 12, border: "1px solid", cursor: "pointer", transition: "all 0.15s", textAlign: "center" },
  monthChip: { padding: "8px 12px", borderRadius: 10, border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  summaryCard: { background: "#E8D06D0d", border: "1px solid #E8D06D33", borderRadius: 12, padding: 16, marginTop: 4 },
  setupOuter: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, width: "100%" },
  setupBox: { width: "100%", maxWidth: 860, margin: "0 auto" },
  setupHeader: { textAlign: "center", marginBottom: 40, width: "100%" },
  setupTitle: { fontSize: 36, fontWeight: 800, marginTop: 12, letterSpacing: -1 },
  setupSub: { fontSize: 15, color: "#888", marginTop: 8 },
  setupCard: { background: "#1a1a2e", borderRadius: 16, padding: "20px 16px", border: "1px solid", textAlign: "center" },
  setupInputField: { flex: 1, background: "transparent", border: "none", color: "#fff", padding: "10px 10px", fontSize: 15, fontFamily: "DM Sans, sans-serif", outline: "none" },
};