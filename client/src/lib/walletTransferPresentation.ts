export type TransferDirection = "in" | "out";

export type InternalTransferPresentation = {
  primary: string;
  secondary: string;
};

function parseParty(note: string, label: "汇款人" | "收款人"): string {
  const match = note.match(new RegExp(`${label}：\\s*([^；\n]+)`));
  return String(match?.[1] || "").trim().slice(0, 120);
}

/**
 * Internal transfers are persisted with a full audit string containing sender,
 * recipient, amount and an immutable transfer number.  Wallet list previews
 * must prioritize the counterparty rather than place it after opaque metadata.
 */
export function getInternalTransferPresentation(
  note: unknown,
  direction: TransferDirection,
  counterpartyName?: unknown,
): InternalTransferPresentation | null {
  const raw = String(note || "");
  const isInternal = raw.includes("[站内转账]") || Boolean(String(counterpartyName || "").trim());
  if (!isInternal) return null;

  const fallbackCounterparty = String(counterpartyName || "").trim().slice(0, 120);
  const sender = parseParty(raw, "汇款人") || (direction === "in" ? fallbackCounterparty : "");
  const recipient = parseParty(raw, "收款人") || (direction === "out" ? fallbackCounterparty : "");

  if (direction === "out") {
    return {
      primary: recipient ? `转给 ${recipient}` : "站内转账汇款",
      secondary: "站内转账",
    };
  }

  return {
    primary: sender ? `${sender} 转入` : "站内转账收款",
    secondary: "站内转账",
  };
}
