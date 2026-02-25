import type { APIRoute } from "astro";
import { db, repositories, mirrorJobs, configs } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { createSecureErrorResponse } from "@/lib/utils";
import { requireAuth } from "@/lib/utils/auth-helpers";
import { deleteGiteaRepo, createGiteaClient, getGiteaRepoOwnerAsync } from "@/lib/gitea";
import { getDecryptedGiteaToken } from "@/lib/utils/config-encryption";

export const PATCH: APIRoute = async (context) => {
  try {
    // Check authentication
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;

    const repoId = context.params.id;
    if (!repoId) {
      return new Response(JSON.stringify({ error: "Repository ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await context.request.json();
    const { destinationOrg } = body;

    // Validate that the repository belongs to the user
    const [existingRepo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repoId), eq(repositories.userId, userId)))
      .limit(1);

    if (!existingRepo) {
      return new Response(JSON.stringify({ error: "Repository not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update the repository's destination override
    await db
      .update(repositories)
      .set({
        destinationOrg: destinationOrg || null,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, repoId));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Repository destination updated successfully",
        destinationOrg: destinationOrg || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Update repository destination", 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const repoId = context.params.id;
    const url = new URL(context.request.url);
    const deleteFromGitea = url.searchParams.get("deleteFromGitea") === "true";

    if (!repoId) {
      return new Response(JSON.stringify({ error: "Repository ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [existingRepo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repoId), eq(repositories.userId, userId)))
      .limit(1);

    if (!existingRepo) {
      return new Response(
        JSON.stringify({ error: "Repository not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Delete from Gitea if requested
    if (deleteFromGitea && existingRepo.mirroredLocation) {
      const [config] = await db
        .select()
        .from(configs)
        .where(eq(configs.userId, userId))
        .limit(1);

      if (config?.giteaConfig) {
        try {
          const giteaToken = getDecryptedGiteaToken(config);
          const giteaClient = createGiteaClient(config.giteaConfig.url, giteaToken);
          const [owner, repoName] = existingRepo.mirroredLocation.split("/");
          
          if (owner && repoName) {
            await deleteGiteaRepo(giteaClient, owner, repoName);
          }
        } catch (giteaError) {
          console.error(`Failed to delete repo from Gitea: ${giteaError}`);
          return new Response(
            JSON.stringify({ 
              error: `Failed to delete from Gitea: ${giteaError instanceof Error ? giteaError.message : "Unknown error"}` 
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    await db
      .delete(repositories)
      .where(and(eq(repositories.id, repoId), eq(repositories.userId, userId)));

    await db
      .delete(mirrorJobs)
      .where(and(eq(mirrorJobs.repositoryId, repoId), eq(mirrorJobs.userId, userId)));

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Delete repository", 500);
  }
};
