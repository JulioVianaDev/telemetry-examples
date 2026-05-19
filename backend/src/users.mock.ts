export interface MockUser {
  id: string;
  name: string;
  tenantId?: string;
}

export const MOCK_USERS: MockUser[] = [
  { id: 'user-1', name: 'Alice',   tenantId: 'tenant-acme' },
  { id: 'user-2', name: 'Bob',     tenantId: 'tenant-acme' },
  { id: 'user-3', name: 'Charlie', tenantId: 'tenant-globex' },
  { id: 'user-4', name: 'Diana',   tenantId: 'tenant-globex' },
  { id: 'user-5', name: 'Eve',     tenantId: 'tenant-initech' },
  { id: 'user-6', name: 'Frank' },  // no tenant — allowed on some routes
  { id: 'user-7', name: 'Grace' },  // no tenant — allowed on some routes
];

const usersMap = new Map(MOCK_USERS.map((u) => [u.id, u]));

export function resolveUser(userId: string | undefined): MockUser | undefined {
  if (!userId) return undefined;
  return usersMap.get(userId);
}
