import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

Deno.serve(async (req: Request) => {
  const responseHeaders = corsHeaders(req);
  const respond = (payload: Record<string, unknown>, status = 200) =>
    json(payload, status, responseHeaders || {});

  if (!responseHeaders && req.headers.has("Origin")) {
    return respond({ error: "Origin is not allowed" }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders || {} });
  }
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !publicKey || !serviceKey) {
    return respond({ error: "Company Owner invitation is not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return respond({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser();
  if (callerError || !callerData.user) {
    return respond({ error: "Unauthorized" }, 401);
  }
  if (normalizeRole(callerData.user.app_metadata?.role) !== "platform_owner") {
    return respond({ error: "Forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const companyId = String(body.companyId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const redirectTo = String(body.redirectTo || "").trim();
  const idempotencyKey = String(
    body.idempotencyKey || req.headers.get("Idempotency-Key") || "",
  ).trim();
  const correlationId = String(body.correlationId || "").trim();

  if (!isUuid(companyId)) return respond({ error: "Valid company identifier is required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond({ error: "Valid Company Owner email is required" }, 400);
  }
  if (name.length < 2) return respond({ error: "Valid Company Owner name is required" }, 400);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return respond({ error: "Valid idempotency key is required" }, 400);
  }
  if (!redirectTo || !isAllowedRedirect(redirectTo)) {
    return respond({ error: "Invitation redirect is not allowed" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existingInvite, error: existingError } = await admin
    .from("platform_company_invitations")
    .select("id,company_id,email,status,auth_user_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) return respond({ error: "Invitation idempotency check failed" }, 500);
  if (existingInvite) {
    if (existingInvite.company_id !== companyId || existingInvite.email !== email) {
      return respond({ error: "Idempotency key is already assigned to another invitation" }, 409);
    }
    return respond({
      ok: true,
      replayed: true,
      invitationId: existingInvite.id,
      companyId,
      email,
      status: existingInvite.status,
      authUserId: existingInvite.auth_user_id,
    });
  }

  const { data: company, error: companyError } = await admin
    .from("platform_companies")
    .select("id,tenant_id,organization_id,company_name,status,owner_auth_user_id,owner_email")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return respond({ error: "Company lookup failed" }, 500);
  if (!company) return respond({ error: "Company not found" }, 404);
  if (!["PROVISIONED", "OWNER_INVITED"].includes(company.status)) {
    return respond({ error: "Company Owner can be invited only after tenant provisioning" }, 409);
  }
  if (
    company.owner_auth_user_id &&
    company.owner_email &&
    String(company.owner_email).toLowerCase() !== email
  ) {
    return respond({ error: "Company already has a different owner identity" }, 409);
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: name,
      onboarding_operation_id: idempotencyKey,
      persona: "company_owner",
    },
  });
  if (inviteError) return respond({ error: inviteError.message }, 400);

  const authUserId = invited.user?.id || "";
  if (!authUserId) return respond({ error: "Company Owner auth account was not created" }, 500);

  try {
    const { error: metadataError } = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        role: "super_admin",
        tenantSlug: company.tenant_id,
        tenant_id: company.tenant_id,
        organizationId: company.organization_id,
        organization_id: company.organization_id,
        onboarding_method: "company_owner_invite",
        onboarding_operation_id: idempotencyKey,
        company_owner: true,
      },
      user_metadata: {
        full_name: name,
      },
    });
    if (metadataError) throw metadataError;

    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { data: recorded, error: recordError } = await admin.rpc(
      "arth_platform_record_owner_invite",
      {
        p_company_id: company.id,
        p_email: email,
        p_auth_user_id: authUserId,
        p_redirect_to: redirectTo,
        p_expires_at: expiresAt,
        p_idempotency_key: idempotencyKey,
        p_actor_user_id: callerData.user.id,
        p_correlation_id: correlationId,
      },
    );
    if (recordError) throw recordError;

    return respond({
      ok: true,
      replayed: false,
      companyId: company.id,
      tenantId: company.tenant_id,
      organizationId: company.organization_id,
      companyName: company.company_name,
      email,
      role: "super_admin",
      persona: "company_owner",
      authUserId,
      invitation: recorded?.invitation || null,
      lifecycle: recorded?.lifecycle || null,
    });
  } catch (error) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return respond({
      error: error instanceof Error
        ? error.message
        : "Company Owner invitation persistence failed",
    }, 500);
  }
});

function normalizeRole(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAllowedRedirect(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      allowedOrigins.has(parsed.origin) &&
      /\/auth-callback\.html$/i.test(parsed.pathname) &&
      !parsed.hash;
  } catch {
    return false;
  }
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("Origin") || "";
  if (origin && !allowedOrigins.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(
  payload: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
