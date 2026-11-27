import { describe, it, expect, vi } from 'vitest';
import { encrypt, decrypt } from '@/lib/auth';

describe('Auth Utility', () => {
  const secretKey = 'test-secret';
  vi.stubEnv('AUTH_SECRET', secretKey);

  const mockUser = {
    id: 'user_123',
    name: 'Test User',
    email: 'test@example.com',
    role: 'ADMIN',
  };

  it('should encrypt and decrypt a payload correctly', async () => {
    const session = await encrypt({ user: mockUser });
    expect(session).toBeTypeOf('string');

    const decrypted = await decrypt(session);
    expect(decrypted.user).toEqual(mockUser);
  });

  it('should fail to decrypt an invalid token', async () => {
    await expect(decrypt('invalid-token')).rejects.toThrow();
  });
});
