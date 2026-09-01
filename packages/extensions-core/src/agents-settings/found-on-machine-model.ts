/** Pure helpers for "Found on this machine" (RFC 0033 R12). */

/** Default profile id when one-click-adding a catalog agent. */
export function profileIdForCatalogAgent(agentId: string): string {
  return agentId.replace(/[^a-z0-9-]/g, "-");
}

/** Whether a scanned agent should still show as an add card. */
export function shouldShowFoundAgentCard(
  agentId: string,
  coveredAgentIds: ReadonlySet<string>,
  existingProfileIds: ReadonlySet<string>,
): boolean {
  if (coveredAgentIds.has(agentId)) return false;
  return !existingProfileIds.has(profileIdForCatalogAgent(agentId));
}
