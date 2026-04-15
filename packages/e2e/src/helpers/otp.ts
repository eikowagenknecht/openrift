import type { connectToDb } from "./db.js";

type Sql = ReturnType<typeof connectToDb>;

export async function fetchLatestOtp(sql: Sql, email: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    const rows = (await sql`
      SELECT value FROM verifications
      WHERE identifier LIKE ${`%${email}%`}
      ORDER BY created_at DESC
      LIMIT 1
    `) as { value: string }[];
    if (rows.length > 0) {
      return rows[0].value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`OTP not found for ${email}`);
}
