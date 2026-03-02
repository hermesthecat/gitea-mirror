import type { APIRoute } from "astro";
import { db, gitCredentials } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { jsonResponse, createSecureErrorResponse } from "@/lib/utils";
import { requireAuthenticatedUserId } from "@/lib/auth-guards";
import { encrypt } from "@/lib/utils/encryption";

// GET - Get single credential by ID
export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const authResult = await requireAuthenticatedUserId({ request, locals });
    if ("response" in authResult) return authResult.response;
    const userId = authResult.userId;

    const { id } = params;
    if (!id) {
      return jsonResponse({
        data: { success: false, error: "Credential ID required" },
        status: 400,
      });
    }

    const [credential] = await db
      .select()
      .from(gitCredentials)
      .where(
        and(eq(gitCredentials.id, id), eq(gitCredentials.userId, userId))
      )
      .limit(1);

    if (!credential) {
      return jsonResponse({
        data: { success: false, error: "Credential not found" },
        status: 404,
      });
    }

    return jsonResponse({
      data: {
        success: true,
        credential: {
          id: credential.id,
          name: credential.name,
          host: credential.host,
          sourceType: credential.sourceType,
          username: credential.username,
          hasToken: !!credential.token,
          createdAt: credential.createdAt,
          updatedAt: credential.updatedAt,
        },
      },
      status: 200,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "credential fetch", 500);
  }
};

// PUT - Update credential
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    const authResult = await requireAuthenticatedUserId({ request, locals });
    if ("response" in authResult) return authResult.response;
    const userId = authResult.userId;

    const { id } = params;
    if (!id) {
      return jsonResponse({
        data: { success: false, error: "Credential ID required" },
        status: 400,
      });
    }

    const body = await request.json();
    const { name, sourceType, username, token } = body;

    // Check if credential exists and belongs to user
    const [existing] = await db
      .select()
      .from(gitCredentials)
      .where(
        and(eq(gitCredentials.id, id), eq(gitCredentials.userId, userId))
      )
      .limit(1);

    if (!existing) {
      return jsonResponse({
        data: { success: false, error: "Credential not found" },
        status: 404,
      });
    }

    // Build update object
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (sourceType !== undefined) updateData.sourceType = sourceType;
    if (username !== undefined) updateData.username = username?.trim() || null;
    if (token !== undefined) {
      updateData.token = token ? encrypt(token) : null;
    }

    const [updated] = await db
      .update(gitCredentials)
      .set(updateData)
      .where(eq(gitCredentials.id, id))
      .returning();

    return jsonResponse({
      data: {
        success: true,
        credential: {
          id: updated.id,
          name: updated.name,
          host: updated.host,
          sourceType: updated.sourceType,
          username: updated.username,
          hasToken: !!updated.token,
        },
      },
      status: 200,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "credential update", 500);
  }
};

// DELETE - Delete credential
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  try {
    const authResult = await requireAuthenticatedUserId({ request, locals });
    if ("response" in authResult) return authResult.response;
    const userId = authResult.userId;

    const { id } = params;
    if (!id) {
      return jsonResponse({
        data: { success: false, error: "Credential ID required" },
        status: 400,
      });
    }

    // Check if credential exists and belongs to user
    const [existing] = await db
      .select()
      .from(gitCredentials)
      .where(
        and(eq(gitCredentials.id, id), eq(gitCredentials.userId, userId))
      )
      .limit(1);

    if (!existing) {
      return jsonResponse({
        data: { success: false, error: "Credential not found" },
        status: 404,
      });
    }

    await db.delete(gitCredentials).where(eq(gitCredentials.id, id));

    return jsonResponse({
      data: { success: true, message: "Credential deleted" },
      status: 200,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "credential delete", 500);
  }
};
