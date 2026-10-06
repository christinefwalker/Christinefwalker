import { getUser } from '@netlify/identity';

export function isAdministrator(user: { roles?: string[] } | null) {
  return user?.roles?.includes('admin') === true;
}

export async function verifiedUser() {
  try {
    return await getUser();
  } catch {
    return null;
  }
}
