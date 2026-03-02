import type { APIRoute } from "astro";
import { db, gitCredentials } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { jsonResponse, createSecureErrorResponse } from "@/lib/utils";
import { requireAuthenticatedUserId } from "@/lib/auth-guards";
import { encrypt, decrypt } from "@/lib/utils/encryption";

// GET - List all credentials for user
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const authResult = await requireAuthenticatedUserId({ request, locals });
    if ("response" in authResult) return authResult.response;
    const userId = authResult.userId;

    const credentials = await db
      .select({
        id: gitCredentials.id,
        name: gitCredentials.name,
        host: gitCredentials.host,
        sourceType: gitCredentials.sourceType,
        username: gitCredentials.username,
        hasToken: gitCredentials.token,
        createdAt: gitCredentials.createdAt,
        updatedAt: gitCredentials.updatedAt,
      })
      .from(gitCredentials)
      .where(eq(gitCredentials.userId, userId));

    // Don't expose actual tokens, just indicate if one exists
    const sanitizedCredentials = credentials.map((cred) => ({
      ...cred,
      hasToken: !!cred.hasToken,
    }));

    return jsonResponse({
      data: { success: true, credentials: sanitizedCredentials },
      status: 200,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "credentials fetch", 500);
  }
};

// POST - Create new credential
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const authResult = await requireAuthenticatedUserId({ request, locals });
    if ("response" in authResult) return authResult.response;
    const userId = authResult.userId;

    const body = await request.json();
    const { name, host, sourceType, username, token } = body;

    if (!name || !host) {
      return jsonResponse({
        data: { success: false, error: "Name and host are required" },
        status: 400,
      });
    }

    // Check if credential for this host already exists
    const [existing] = await db
      .select()
      .from(gitCredentials)
      .where(
        and(eq(gitCredentials.userId, userId), eq(gitCredentials.host, host))
      )
      .limit(1);

    if (existing) {
      return jsonResponse({
        data: {
          success: false,
          error: `Credential for host "${host}" already exists`,
        },
        status: 409,
      });
    }

    // Encrypt token if provided
    const encryptedToken = token ? encrypt(token) : null;

    const [newCredential] = await db
      .insert(gitCredentials)
      .values({
        id: uuidv4(),
        userId,
        name: name.trim(),
        host: host.trim().toLowerCase(),
        sourceType: sourceType || "git",
        username: username?.trim() || null,
        token: encryptedToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return jsonResponse({
      data: {
        success: true,
        credential: {
          id: newCredential.id,
          name: newCredential.name,
          host: newCredential.host,
          sourceType: newCredential.sourceType,
          username: newCredential.username,
          hasToken: !!newCredential.token,
        },
      },
      status: 201,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "credential create", 500);
  }
};
