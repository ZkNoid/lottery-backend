import { Field, Group } from '../wrapped.js';
import { PrivateKey, PublicKey } from './signature.js';
import { Bytes } from '../bytes.js';
export { encrypt, decrypt, encryptV2, decryptV2, encryptBytes, decryptBytes, CipherTextBytes, CipherText, };
type CipherText = {
    publicKey: Group;
    cipherText: Field[];
};
type CipherTextBytes = CipherText & {
    messageLength: number;
};
/**
 * @deprecated Use {@link encryptV2} instead.
 * Public Key Encryption, using a given array of {@link Field} elements and encrypts it using a {@link PublicKey}.
 */
declare function encrypt(message: Field[], otherPublicKey: PublicKey): {
    publicKey: import("../group.js").Group;
    cipherText: import("../field.js").Field[];
};
/**
 * @deprecated Use {@link decryptV2} instead.
 * Decrypts a {@link CipherText} using a {@link PrivateKey}.
 */
declare function decrypt({ publicKey, cipherText }: CipherText, privateKey: PrivateKey): import("../field.js").Field[];
/**
 * Decrypts a {@link CipherText} using a {@link PrivateKey}.
 */
declare function decryptV2({ publicKey, cipherText }: CipherText, privateKey: PrivateKey): import("../field.js").Field[];
/**
 * Public Key Encryption, encrypts Field elements using a {@link PublicKey}.
 */
declare function encryptV2(message: Field[], otherPublicKey: PublicKey): CipherText;
/**
 * Public Key Encryption, encrypts Bytes using a {@link PublicKey}.
 */
declare function encryptBytes(message: Bytes, otherPublicKey: PublicKey): CipherTextBytes;
/**
 * Decrypts a {@link CipherText} using a {@link PrivateKey}.
 */
declare function decryptBytes(cipherText: CipherTextBytes, privateKey: PrivateKey): Bytes;
