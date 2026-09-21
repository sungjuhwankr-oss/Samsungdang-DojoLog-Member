export const SAMSUNGDANG_FEATURE = Object.freeze({
  SESSION_SHARE_IMPORT: "session-share-import",
  TRAINING_PROGRESS: "training-progress"
});

const KNOWN_FEATURES = new Set(Object.values(SAMSUNGDANG_FEATURE));

/**
 * This module does not verify or persist credentials.  A later credential
 * verifier may supply only its final result here; until then every install is
 * intentionally treated as a general (B) user.
 */
export function createMembershipFeatureGate(verification) {
  const hasValidMembershipCredential = verification?.status === "valid";

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
  // Credential storage and verification are intentionally out of scope until
  // the later credential phases define and implement them.
  return createMembershipFeatureGate(null);
}

export async function loadCurrentMembershipFeatureGate() {
  return getCurrentMembershipFeatureGate();
}
