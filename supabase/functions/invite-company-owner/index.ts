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
  const action = String(body.action || "send").trim().toLowerCase();
  const companyId = String(body.companyId || "").trim();
  const invitationId = String(body.invitationId || "").trim();
  let email = String(body.email || "").trim().toLowerCase();
  let name = String(body.name || "").trim();
  let phone = String(body.phone || "").trim();
  let department = String(body.department || "").trim();
  const role = normalizeRole(body.role || "super_admin");
  const redirectTo = String(body.redirectTo || "").trim();
  const idempotencyKey = String(
    body.idempotencyKey || req.headers.get("Idempotency-Key") || "",
  ).trim();
  const correlationId = String(body.correlationId || "").trim();
  const reason = String(body.reason || "").trim();

  if (!["send", "resend", "revoke"].includes(action)) {
    return respond({ error: "Unsupported Company Owner invitation action" }, 400);
  }
  if (!isUuid(companyId)) return respond({ error: "Valid company identifier is required" }, 400);
  if (action !== "send" && !isUuid(invitationId)) {
    return respond({ error: "Valid Company Owner invitation identifier is required" }, 400);
  }
  if (role !== "super_admin") return respond({ error: "Company Owner role must be Super Admin" }, 400);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return respond({ error: "Valid idempotency key is required" }, 400);
  }
  if (action !== "revoke" && (!redirectTo || !isAllowedRedirect(redirectTo))) {
    return respond({ error: "Invitation redirect is not allowed" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action !== "revoke") {
    const { data: existingInvite, error: existingError } = await admin
      .from("platform_company_invitations")
      .select("id,company_id,email,status,auth_user_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) return respond({ error: "Invitation idempotency check failed" }, 500);
    if (existingInvite) {
      if (existingInvite.company_id !== companyId) {
        return respond({ error: "Idempotency key is already assigned to another invitation" }, 409);
      }
      return respond({
        ok: true,
        action,
        replayed: true,
        invitationId: existingInvite.id,
        companyId,
        email: existingInvite.email,
        status: existingInvite.status,
        authUserId: existingInvite.auth_user_id,
      });
    }
  }

  const { data: company, error: companyError } = await admin
    .from("platform_companies")
    .select("id,tenant_id,organization_id,company_name,status,owner_auth_user_id,owner_email,metadata")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return respond({ error: "Company lookup failed" }, 500);
  if (!company) return respond({ error: "Company not found" }, 404);

  const companyMetadata = isRecord(company.metadata) ? company.metadata : {};
  const persistedOwner = isRecord(companyMetadata.companyOwner)
    ? companyMetadata.companyOwner
    : {};

  if (action !== "send") {
    const { data: currentInvite, error: currentInviteError } = await admin
      .from("platform_company_invitations")
      .select("id,company_id,email,status,auth_user_id")
      .eq("id", invitationId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (currentInviteError) return respond({ error: "Company Owner invitation lookup failed" }, 500);
    if (!currentInvite) return respond({ error: "Company Owner invitation not found" }, 404);
    if (["ACCEPTED", "ACTIVATED"].includes(String(currentInvite.status || "").toUpperCase())) {
      return respond({ error: "Accepted invitations cannot be changed" }, 409);
    }

    const priorAuthUserId = String(currentInvite.auth_user_id || "").trim();
    if (priorAuthUserId) {
      const { data: priorUser, error: priorUserError } = await admin.auth.admin.getUserById(priorAuthUserId);
      if (priorUserError && !/not found/i.test(priorUserError.message || "")) {
        return respond({ error: "Pending Company Owner account could not be verified" }, 500);
      }
      if (priorUser?.user?.email_confirmed_at || priorUser?.user?.confirmed_at) {
        return respond({ error: "Accepted invitations cannot be changed" }, 409);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(priorAuthUserId);
      if (deleteError && !/not found/i.test(deleteError.message || "")) {
        return respond({ error: "Pending Company Owner account could not be revoked" }, 500);
      }
    }

    const { data: closed, error: closeError } = await admin.rpc(
      "arth_platform_close_owner_invite",
      {
        p_invitation_id: currentInvite.id,
        p_action: action.toUpperCase(),
        p_reason: reason || (action === "revoke"
          ? "Company Owner invitation revoked by Platform Owner."
          : "Company Owner invitation prepared for resend."),
        p_idempotency_key: idempotencyKey,
        p_actor_user_id: callerData.user.id,
        p_correlation_id: correlationId,
      },
    );
    if (closeError) return respond({ error: closeError.message }, 500);
    if (action === "revoke") {
      return respond({
        ok: true,
        action,
        replayed: !!closed?.replayed,
        invitationId: currentInvite.id,
        companyId,
        email: currentInvite.email,
        status: "REVOKED",
        lifecycle: closed?.lifecycle || null,
      });
    }
    email = String(currentInvite.email || persistedOwner.email || company.owner_email || "").trim().toLowerCase();
  }

  name = name || String(persistedOwner.name || "").trim();
  email = email || String(persistedOwner.email || company.owner_email || "").trim().toLowerCase();
  phone = phone || String(persistedOwner.phone || "").trim();
  department = department || String(persistedOwner.department || "").trim();

  if (!["PROVISIONED", "OWNER_INVITED"].includes(company.status)) {
    return respond({ error: "Company Owner can be invited only after tenant provisioning" }, 409);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond({ error: "Valid Company Owner email is required" }, 400);
  }
  if (name.length < 2) return respond({ error: "Valid Company Owner name is required" }, 400);
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
      phone,
      department,
      onboarding_operation_id: idempotencyKey,
      persona: "company_owner",
    },
  });
  if (inviteError) {
    await recordInviteFailure(admin, {
      companyId: company.id,
      email,
      action,
      reason: inviteError.message,
      redirectTo,
      idempotencyKey,
      actorUserId: callerData.user.id,
      correlationId,
    });
    return respond({ error: inviteError.message }, 400);
  }

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
        phone,
        department,
      },
    });
    if (metadataError) throw metadataError;

    const configuredExpiryMinutes = Number(Deno.env.get("AUTH_INVITE_EXPIRY_MINUTES") || "60");
    const expiryMinutes = Number.isFinite(configuredExpiryMinutes)
      ? Math.min(10080, Math.max(5, configuredExpiryMinutes))
      : 60;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
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
      action,
      replayed: false,
      companyId: company.id,
      tenantId: company.tenant_id,
      organizationId: company.organization_id,
      companyName: company.company_name,
      email,
      role: "super_admin",
      persona: "company_owner",
      authUserId,
      expiresAt,
      invitation: recorded?.invitation || null,
      lifecycle: recorded?.lifecycle || null,
    });
  } catch (error) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    const failureMessage = error instanceof Error
      ? error.message
      : "Company Owner invitation persistence failed";
    await recordInviteFailure(admin, {
      companyId: company.id,
      email,
      action,
      reason: failureMessage,
      redirectTo,
      idempotencyKey,
      actorUserId: callerData.user.id,
      correlationId,
    });
    return respond({
      error: failureMessage,
    }, 500);
  }
});

async function recordInviteFailure(
  admin: ReturnType<typeof createClient>,
  input: {
    companyId: string;
    email: string;
    action: string;
    reason: string;
    redirectTo: string;
    idempotencyKey: string;
    actorUserId: string;
    correlationId: string;
  },
): Promise<void> {
  const { error } = await admin.rpc("arth_platform_record_owner_invite_failure", {
    p_company_id: input.companyId,
    p_email: input.email,
    p_action: input.action,
    p_reason: input.reason,
    p_redirect_to: input.redirectTo,
    p_idempotency_key: input.idempotencyKey,
    p_actor_user_id: input.actorUserId,
    p_correlation_id: input.correlationId,
  });
  if (error) {
    console.error("Company Owner invitation failure audit could not be persisted.", {
      companyId: input.companyId,
      action: input.action,
      code: error.code || "",
    });
  }
}

function normalizeRole(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
