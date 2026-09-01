import { supabase } from "./supabase";

const TABLE_NAME = "budgetwise_data";

/**
 * Fetch all BudgetWise data for a user.
 */
export async function fetchBudgetwiseData(userId) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("user_id", userId)
    .single();

  return { data, error };
}

/**
 * Save the complete BudgetWise state.
 * Uses user_id as the conflict target.
 */
export async function saveBudgetwiseData(userId, {
  categories,
  transactions,
  loans,
  simpleBorrows,
  setupDone,
}) {
  const payload = {
    user_id: userId,
    categories,
    transactions,
    loans,
    simple_borrows: simpleBorrows,
    setup_done: setupDone,
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, { onConflict: "user_id" });

  return { data, error };
}

/**
 * Save the initial BudgetWise setup.
 */
export async function saveInitialSetup(userId, categories) {
  const payload = {
    user_id: userId,
    categories,
    transactions: [],
    loans: [],
    simple_borrows: [],
    setup_done: true,
  };

  const { data: existing, error: fetchError } = await supabase
    .from(TABLE_NAME)
    .select("id")
    .eq("user_id", userId)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    return {
      data: null,
      error: fetchError,
    };
  }

  if (existing) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(payload)
      .eq("user_id", userId);

    return { data, error };
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(payload);

  return { data, error };
}

/**
 * Subscribe to realtime changes for a user's BudgetWise data.
 */
export function subscribeToBudgetwiseData(userId, onDataChange) {
  const channel = supabase
    .channel("budgetwise_sync")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE_NAME,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onDataChange(payload);
      }
    )
    .subscribe();

  return channel;
}

/**
 * Remove a BudgetWise realtime subscription.
 */
export async function unsubscribeFromBudgetwiseData(channel) {
  return supabase.removeChannel(channel);
}