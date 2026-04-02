import { api } from "../api";

export async function getHouseholdOverview() {
  return api("/household");
}

export async function getMyHouseholdInvitations() {
  return api("/household/invitations/mine");
}

export async function sendHouseholdInvitation(email) {
  return api("/household/invitations", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function acceptHouseholdInvitation(invitationId) {
  return api(`/household/invitations/${invitationId}/accept`, {
    method: "POST",
  });
}
