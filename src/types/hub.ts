/**
 * Hub sync payload type.
 * Adjust this type to match the Central Admin Hub's real API contract.
 * All monetary values are sent as strings to avoid floating-point precision loss.
 */
export interface HubSyncPayload {
  date: string; // "YYYY-MM-DD"
  totalCollection: string;
  totalExpenses: string;
  expenseBreakdown: {
    fuel: string;
    tollAndLineFees: string;
    crewPay: string;
    maintenance: string;
  };
  netProfit: string;
  source: "fleet-management";
}

export interface HubSyncResponse {
  success: boolean;
  message?: string;
}
