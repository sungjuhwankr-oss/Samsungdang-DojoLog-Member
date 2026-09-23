import { verifyCredentialJson, verifyCredentialToken } from "./credential-verifier.mjs";

export {
  CREDENTIAL_REASON,
  calculateKeyIdFromSpki,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";

export function verifyMembershipCredentialJson(envelopeJson, options = {}) {
  return verifyCredentialJson(envelopeJson, { ...options, expectedType: "membership" });
}

export function verifyMembershipCredentialToken(token, options = {}) {
  return verifyCredentialToken(token, { ...options, expectedType: "membership" });
}
