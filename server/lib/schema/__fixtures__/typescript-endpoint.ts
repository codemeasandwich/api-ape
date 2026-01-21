/**
 * @fileoverview Test fixture for TypeScript-based schema extraction
 */

interface ProfileInput {
  userId: string;
}

interface ProfileOutput {
  name: string;
  email: string;
  age?: number;
}

export default async function getProfile(
  data: ProfileInput
): Promise<ProfileOutput> {
  return { name: "Alice", email: "alice@example.com" };
}
