import type { MetaCreditVisibility } from "@openrift/shared/types/enums";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface AdminsTable {
  userId: string;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface AdminGrantsTable {
  userId: string;
  section: string;
  createdAt: CreatedAt;
}

export interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Generated<boolean>;
  image: string | null;
  shareToken: string | null;
  riotId: string | null;
  metaCreditVisibility: Generated<MetaCreditVisibility>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface SessionsTable {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface AccountsTable {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  idToken: string | null;
  password: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface VerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ApiKeysTable {
  id: string;
  configId: Generated<string>;
  name: string | null;
  start: string | null;
  prefix: string | null;
  key: string;
  referenceId: string;
  refillInterval: number | null;
  refillAmount: number | null;
  lastRefillAt: Date | null;
  enabled: Generated<boolean>;
  rateLimitEnabled: Generated<boolean>;
  rateLimitTimeWindow: number | null;
  rateLimitMax: number | null;
  requestCount: Generated<number>;
  remaining: number | null;
  lastRequest: Date | null;
  expiresAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  permissions: string | null;
  metadata: string | null;
}
