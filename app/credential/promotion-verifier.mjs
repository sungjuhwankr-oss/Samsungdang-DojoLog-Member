import { verifyCredentialJson, verifyCredentialToken } from "./credential-verifier.mjs";

export {
  CREDENTIAL_REASON,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";

export function verifyPromotionCredentialJson(envelopeJson, options = {}) {
  return verifyCredentialJson(envelopeJson, { ...options, expectedType: "promotion" });
}

export function verifyPromotionCredentialToken(token, options = {}) {
  return verifyCredentialToken(token, { ...options, expectedType: "promotion" });
}
