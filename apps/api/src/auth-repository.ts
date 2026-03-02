import { PrismaClient } from '@prisma/client';

export type AuthUserRecord = {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  password_hash: string | null;
};

export type AuthSessionRecord = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateAuthUserInput = {
  email: string;
  full_name: string;
  password_hash: string;
};

export type CreateAuthSessionInput = {
  user_id: string;
  token_hash: string;
  expires_at: Date;
};

export interface AuthRepository {
  createUser(input: CreateAuthUserInput): Promise<AuthUserRecord>;
  updateUserPassword(userId: string, input: { password_hash: string; full_name?: string }): Promise<AuthUserRecord>;
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  findActiveSessionByTokenHash(tokenHash: string, at: Date): Promise<AuthSessionRecord | null>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;
  assignRoleByCode(userId: string, roleCode: string): Promise<void>;
}

class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: CreateAuthUserInput): Promise<AuthUserRecord> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        full_name: input.full_name,
        is_active: true,
        password_hash: input.password_hash,
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_active: true,
        password_hash: true,
      },
    });
  }

  async updateUserPassword(
    userId: string,
    input: { password_hash: string; full_name?: string },
  ): Promise<AuthUserRecord> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: input.password_hash,
        full_name: input.full_name,
      },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_active: true,
        password_hash: true,
      },
    });
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_active: true,
        password_hash: true,
      },
    });
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        full_name: true,
        is_active: true,
        password_hash: true,
      },
    });
  }

  async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    return this.prisma.authSession.create({
      data: {
        user_id: input.user_id,
        token_hash: input.token_hash,
        expires_at: input.expires_at,
      },
    });
  }

  async findActiveSessionByTokenHash(tokenHash: string, at: Date): Promise<AuthSessionRecord | null> {
    return this.prisma.authSession.findFirst({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: {
          gt: at,
        },
      },
      orderBy: [{ created_at: 'desc' }],
    });
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        revoked_at: revokedAt,
      },
    });
  }

  async assignRoleByCode(userId: string, roleCode: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { code: roleCode },
      select: { id: true },
    });

    if (role === null) {
      throw new Error(`Role not found: ${roleCode}`);
    }

    await this.prisma.userRole.upsert({
      where: {
        user_id_role_id: {
          user_id: userId,
          role_id: role.id,
        },
      },
      create: {
        user_id: userId,
        role_id: role.id,
      },
      update: {},
    });
  }
}

export function createPrismaAuthRepository(prismaClient = new PrismaClient()): AuthRepository {
  return new PrismaAuthRepository(prismaClient);
}
