import { verifyCredentialJson, verifyCredentialToken } from "./credential-verifier.mjs";

export {
  CREDENTIAL_REASON,
  decodeCredentialTransportToken,
  encodeCredentialTransportJson,
  parseCredentialTokenFromSearch
} from "./credential-verifier.mjs";

export function verifySpecialTrainingCredentialJson(envelopeJson, options = {}) {
  return verifyCredentialJson(envelopeJson, { ...options, expectedType: "special-training" });
}

export function verifySpecialTrainingCredentialToken(token, options = {}) {
  return verifyCredentialToken(token, { ...options, expectedType: "special-training" });
}
