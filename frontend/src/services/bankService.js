import { api } from "../api";

export async function getBankProviders() {
  return api("/bank/providers");
}

export async function getBankCredentialStatus() {
  return api("/bank/credentials");
}

export async function saveBankCredentials(payload) {
  return api("/bank/credentials", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeBankConnection(connectionId) {
  return api(`/bank/credentials/${connectionId}`, { method: "DELETE" });
}

export async function removeAllBankConnections() {
  return api("/bank/credentials", { method: "DELETE" });
}
