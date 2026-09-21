import { loadStoredMembershipVerification } from "./membership-store.mjs";

export const SAMSUNGDANG_FEATURE = Object.freeze({
  SESSION_SHARE_IMPORT: "session-share-import",
  TRAINING_PROGRESS: "training-progress",
  MEMBERSHIP_CARD: "membership-card"
});

const KNOWN_FEATURES = new Set(Object.values(SAMSUNGDANG_FEATURE));

/** The gate consumes only a completed production-verifier result. */
export function createMembershipFeatureGate(verification) {
  const hasValidMembershipCredential = verification?.valid === true &&
    verification?.reason === "OK" &&
    verification?.credentialType === "membership" &&
    typeof verification?.keyId === "string" &&
    typeof verification?.credentialId === "string" &&
    verification?.verifiedPayload !== null;

  return Object.freeze({
    hasValidMembershipCredential,
    enabledFeatures: Object.freeze(
      hasValidMembershipCredential ? [...KNOWN_FEATURES] : []
    )
  });
}

export function allowsSamsungdangFeature(gate, feature) {
  return gate.hasValidMembershipCredential === true &&
    gate.enabledFeatures.includes(feature);
}

export function getCurrentMembershipFeatureGate() {
  // Synchronous rendering starts fail-closed as B until stored verification finishes.
  return createMembershipFeatureGate(null);
}

export async function loadCurrentMembershipFeatureGate() {
  try {
    return createMembershipFeatureGate(await loadStoredMembershipVerification());
  } catch {
    return getCurrentMembershipFeatureGate();
  }
}
