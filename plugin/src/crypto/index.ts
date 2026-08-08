/** Публичный API криптомодуля. Раздел 2 спецификации, только WebCrypto. */

export type { KeyBundle } from './keys';
export {
  MASTER_BYTES,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  contentKeyInfo,
  deriveBundle,
  deriveKeys,
  deriveMaster,
  generateSalt,
  metaKeyInfo,
  pathKeyInfo,
} from './keys';

export {
  IV_BYTES,
  decryptBuffer,
  decryptBytes,
  decryptString,
  encryptBuffer,
  encryptBytes,
  encryptString,
} from './cipher';

export { computeDocId, normalizeRelPath } from './docid';

export { VERIFIER_PREFIX, checkVerifier, createVerifier, verifierPlaintext } from './verifier';

export { sha256, sha256Base64Url, sha256Hex } from './hash';

export type { DocMeta, DocOp } from './meta';
export { DOC_OPS, decryptMeta, encryptMeta, parseMeta, serializeMeta } from './meta';

export type { Bytes } from './encoding';
export {
  fromBase64,
  fromBase64Url,
  toArrayBuffer,
  toBase64,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
} from './encoding';
