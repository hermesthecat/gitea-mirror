import { defineMiddleware } from 'astro:middleware';
import { startCleanupService, stopCleanupService } from './lib/cleanup-service';
import { startSchedulerService, stopSchedulerService } from './lib/scheduler-service';
import { startRepositoryCleanupService, stopRepositoryCleanupService } from './lib/repository-cleanup-service';
import { initializeShutdownManager, registerShutdownCallback, isShuttingDown } from './lib/shutdown-manager';
import { setupSignalHandlers } from './lib/signal-handlers';
import { auth } from './lib/auth';
import { isHeaderAuthEnabled, authenticateWithHeaders } from './lib/auth-header';
import { initializeConfigFromEnv } from './lib/env-config-loader';
import { db, users } from './lib/db';

// Initialize shutdown manager and signal handlers at module load (not waiting for first request)
initializeShutdownManager();
setupSignalHandlers();

// Flag to track if services have been initialized
let cleanupServiceStarted = false;
let schedulerServiceStarted = false;
let repositoryCleanupServiceStarted = false;
let envConfigInitialized = false;
let envConfigCheckCount = 0; // Track attempts to avoid excessive checking

export const onRequest = defineMiddleware(async (context, next) => {
  // Reject new requests during shutdown
  if (isShuttingDown()) {
    return new Response('Service is shutting down', { status: 503 });
  }

  // First, try Better Auth session (cookie-based)
  try {
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });

    if (session) {
      context.locals.user = session.user;
      context.locals.session = session.session;
    } else {
      // No cookie session, check for header authentication
      if (isHeaderAuthEnabled()) {
        const headerUser = await authenticateWithHeaders(context.request.headers);
        if (headerUser) {
          // Create a session-like object for header auth
          context.locals.user = {
            id: headerUser.id,
            email: headerUser.email,
            emailVerified: headerUser.emailVerified,
            name: headerUser.name || headerUser.username,
            username: headerUser.username,
            createdAt: headerUser.createdAt,
            updatedAt: headerUser.updatedAt,
          };
          context.locals.session = {
            id: `header-${headerUser.id}`,
            userId: headerUser.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
            ipAddress: context.request.headers.get('x-forwarded-for') || context.clientAddress,
            userAgent: context.request.headers.get('user-agent'),
          };
        } else {
          context.locals.user = null;
          context.locals.session = null;
        }
      } else {
        context.locals.user = null;
        context.locals.session = null;
      }
    }
  } catch (error) {
    // If there's an error getting the session, set to null
    context.locals.user = null;
    context.locals.session = null;
  }

  // Initialize configuration from environment variables
  // Optimized to minimize performance impact:
  // - Once initialized, no checks are performed (envConfigInitialized = true)
  // - Limits checks to first 100 requests to avoid DB queries on every request if no users exist
  // - After user creation, env vars load on next request and flag is set permanently
  if (!envConfigInitialized && envConfigCheckCount < 100) {
    envConfigCheckCount++;
    
    // Only check every 10th request after the first 10 to reduce DB load
    const shouldCheck = envConfigCheckCount <= 10 || envConfigCheckCount % 10 === 0;
    
    if (shouldCheck) {
      try {
        const hasUsers = await db.select().from(users).limit(1).then(u => u.length > 0);
        
        if (hasUsers) {
          // We have users now, try to initialize config
          await initializeConfigFromEnv();
          envConfigInitialized = true; // This ensures we never check again
          console.log('✅ Environment configuration loaded after user creation');
        }
      } catch (error) {
        console.error('⚠️  Failed to initialize configuration from environment:', error);
        // Continue anyway - environment config is optional
      }
    }
  }

  // Start cleanup service only once
  if (!cleanupServiceStarted) {
    try {
      console.log('Starting automatic database cleanup service...');
      startCleanupService();

      // Register cleanup service shutdown callback
      registerShutdownCallback(async () => {
        console.log('🛑 Shutting down cleanup service...');
        stopCleanupService();
      });

      cleanupServiceStarted = true;
    } catch (error) {
      console.error('Failed to start cleanup service:', error);
      // Don't fail the request if cleanup service fails to start
    }
  }

  // Start scheduler service only once
  if (!schedulerServiceStarted) {
    try {
      console.log('Starting automatic mirror scheduler service...');
      // Start the scheduler service (now async)
      startSchedulerService().catch(error => {
        console.error('Error in scheduler service startup:', error);
      });

      // Register scheduler service shutdown callback
      registerShutdownCallback(async () => {
        console.log('🛑 Shutting down scheduler service...');
        stopSchedulerService();
      });

      schedulerServiceStarted = true;
    } catch (error) {
      console.error('Failed to start scheduler service:', error);
      // Don't fail the request if scheduler service fails to start
    }
  }

  // Start repository cleanup service only once
  if (!repositoryCleanupServiceStarted) {
    try {
      console.log('Starting repository cleanup service...');
      startRepositoryCleanupService();

      // Register repository cleanup service shutdown callback
      registerShutdownCallback(async () => {
        console.log('🛑 Shutting down repository cleanup service...');
        stopRepositoryCleanupService();
      });

      repositoryCleanupServiceStarted = true;
    } catch (error) {
      console.error('Failed to start repository cleanup service:', error);
      // Don't fail the request if repository cleanup service fails to start
    }
  }

  // Continue with the request
  return next();
});
