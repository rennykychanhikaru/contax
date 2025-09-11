/**
 * Cryptographic utilities for secure data handling
 * Uses Web Crypto API for encryption/decryption of sensitive data
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'

// Get encryption key from environment or generate a warning
const getEncryptionKey = (): Buffer => {
  const key = process.env.WEBHOOK_ENCRYPTION_KEY
  
  if (!key) {
    // In production, this should throw an error
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WEBHOOK_ENCRYPTION_KEY is required in production')
    }
    
    // For development, use a default key (NOT SECURE - only for local dev)
    console.warn('⚠️  Using default encryption key - SET WEBHOOK_ENCRYPTION_KEY in production!')
    return Buffer.from('dev-only-key-change-in-production-123456789012', 'utf-8').slice(0, 32)
  }
  
  // Ensure key is 32 bytes for AES-256
  const keyBuffer = Buffer.from(key, 'hex')
  if (keyBuffer.length !== 32) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY must be 32 bytes (64 hex characters)')
  }
  
  return keyBuffer
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param plaintext - The data to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    const key = getEncryptionKey()
    
    // Generate random IV (initialization vector)
    const iv = randomBytes(16)
    
    // Create cipher
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    
    // Encrypt the data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    // Get the auth tag for integrity verification
    const authTag = cipher.getAuthTag()
    
    // Combine IV, auth tag, and encrypted data
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt data encrypted with encrypt()
 * @param encryptedData - The encrypted data string
 * @returns Decrypted plaintext
 */
export async function decrypt(encryptedData: string): Promise<string> {
  try {
    const key = getEncryptionKey()
    
    // Parse the encrypted data
    const parts = encryptedData.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format')
    }
    
    const [ivHex, authTagHex, encrypted] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    // Create decipher
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * Generate a cryptographically secure random token
 * @param bytes - Number of random bytes (default 32)
 * @returns URL-safe base64 encoded token
 */
export function generateSecureToken(bytes: number = 32): string {
  const buffer = randomBytes(bytes)
  // Make it URL-safe by replacing non-URL-safe characters
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Generate a secure webhook secret
 * @returns Hex-encoded secret (96 characters)
 */
export function generateWebhookSecret(): string {
  // 48 bytes = 384 bits of entropy (very secure)
  return randomBytes(48).toString('hex')
}

/**
 * Hash a value using SHA-256
 * @param value - Value to hash
 * @returns Hex-encoded hash
 */
export function hashSHA256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * Verify a webhook signature (HMAC-SHA256)
 * @param payload - Request body as string
 * @param signature - Signature from webhook header
 * @param secret - Webhook secret
 * @returns True if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false
  }
  
  // Calculate expected signature
  const hmac = createHash('sha256')
  hmac.update(secret + payload)
  const expectedSignature = hmac.digest('hex')
  
  // Use constant-time comparison
  return secureCompare(signature, expectedSignature)
}

/**
 * Generate a secure encryption key for first-time setup
 * @returns Hex-encoded 32-byte key for AES-256
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}