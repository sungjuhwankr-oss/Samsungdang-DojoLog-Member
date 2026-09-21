export interface AndroidKeystorePocFixture {
  schema: string;
  schemaVersion: number;
  pocPhase: string;
  pocStatus: string;
  inputText: string;
  inputUtf8Base64Url: string;
  inputUtf8ByteLength: number;
  publicKeyBase64Url: string;
  publicKeyByteLength: number;
  signatureBase64Url: string;
  signatureByteLength: number;
  privateKeyEncodedIsNull: boolean;
}

export interface AndroidKeystorePocVerificationResult {
  webCryptoAvailable: boolean;
  fixtureSchema: string;
  fixtureStatus: string;
  fixtureIdentityPassed: boolean;
  utf8BytesIdentical: boolean;
  spkiPublicKeyImportPassed: boolean;
  androidSignatureByteLength: number;
  signatureRepresentationObserved: string;
  directDerVerifyPassed: boolean;
  directDerVerifyOutcome: string;
  signatureAdapterUsed: boolean;
  adaptedSignatureByteLength: number;
  originalVerifyPassed: boolean;
  inputTamperRejected: boolean;
  signatureTamperRejected: boolean;
  publicKeyTamperRejected: boolean;
  publicKeyTamperOutcome: string;
  declaredLengthsIdentical: boolean;
  overallPassed: boolean;
}

export const ANDROID_KEYSTORE_POC_SCHEMA: string;
export const ANDROID_KEYSTORE_POC_SCHEMA_VERSION: number;
export const ANDROID_KEYSTORE_POC_PHASE: string;
export const ANDROID_KEYSTORE_POC_STATUS: string;
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean;
export function decodeUnpaddedBase64Url(value: string): Uint8Array;
export function derEcdsaSignatureToFixedWidth(
  signature: Uint8Array,
  scalarByteLength?: number
): Uint8Array;
export function importP256Spki(publicKeyBytes: Uint8Array): Promise<CryptoKey>;
export function verifyAndroidKeystorePocVector(
  fixture: AndroidKeystorePocFixture
): Promise<AndroidKeystorePocVerificationResult>;
