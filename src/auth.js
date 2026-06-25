const crypto = require('node:crypto');

const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
    .toString('hex');

  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [method, iterations, salt, storedHash] = String(passwordHash).split('$');

  if (method !== 'pbkdf2' || !iterations || !salt || !storedHash) {
    return false;
  }

  const candidateHash = crypto
    .pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, DIGEST)
    .toString('hex');

  return crypto.timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}

module.exports = {
  hashPassword,
  verifyPassword
};
