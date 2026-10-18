import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const allowedCallerRoles = new Set(["hr", "hr_head", "admin", "super_admin"]);
const assignableRoles = new Set(["employee", "manager", "admin", "hr", "hr_head", "director"]);
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

Deno.serve(async (req: Request) => {
  const responseHeaders = corsHeaders(req);
  const respond = (payload: Record<string, unknown>, status = 200) => json(payload, status, responseHeaders || {});
  if (!responseHeaders && req.headers.has("Origin")) return respond({ error: "Origin is not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders || {} });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !publicKey || !serviceKey) return respond({ error: "Invite function is not configured" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);
  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser();
  if (callerError || !callerData.user) return respond({ error: "Unauthorized" }, 401);

  const metadata = callerData.user.app_metadata || {};
  const callerRole = normalizeRole(metadata.role);
  const callerTenant = normalizeTenant(metadata.tenantSlug || metadata.tenant_id || metadata.tenantId);
  const callerOrganization = String(metadata.organizationId || metadata.organization_id || callerTenant).trim();
  if (!allowedCallerRoles.has(callerRole)) return respond({ error: "Forbidden" }, 403);
  if (!callerTenant || !callerOrganization) return respond({ error: "Trusted tenant claims are required" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "send").trim().toLowerCase();
  let email = String(body.email || "").trim().toLowerCase();
  let role = normalizeRole(body.role || "employee");
  let empId = String(body.empId || "").trim();
  const inviteId = String(body.inviteId || "").trim();
  let redirectTo = String(body.redirectTo || "").trim();
  let name = String(body.name || "").trim();
  const requestedTenant = normalizeTenant(body.tenantSlug || body.tenantId || callerTenant);
  const requestedOrganization = String(body.organizationId || callerOrganization).trim();

  if (requestedTenant !== callerTenant || requestedOrganization !== callerOrganization) {
    return respond({ error: "Cross-tenant invite denied" }, 403);
  }
  if (!["send", "resend", "cancel"].includes(action)) return respond({ error: "Unsupported invite action" }, 400);
  if (!inviteId) return respond({ error: "Invite identifier is required" }, 400);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let existingInvitePayload: Record<string, unknown> = {};
  let existingInviteRowId = "";
  if (action !== "send") {
    const { data: existingInvite, error: existingInviteError } = await admin
      .from("hrms_identity_records")
      .select("id,subject_id,payload")
      .eq("tenant_id", callerTenant)
      .eq("organization_id", callerOrganization)
      .eq("record_type", "authInvites")
      .eq("record_id", inviteId)
      .maybeSingle();
    if (existingInviteError) return respond({ error: "Invite lookup failed" }, 500);
    if (!existingInvite) return respond({ error: "Invitation not found" }, 404);
    existingInviteRowId = String(existingInvite.id || "");
    existingInvitePayload = isRecord(existingInvite.payload) ? existingInvite.payload : {};
    const currentStatus = String(
      existingInvitePayload.activationStatus || existingInvitePayload.inviteStatus || existingInvitePayload.status || "",
    ).trim().toLowerCase();
    if (currentStatus === "active" || currentStatus === "activated") {
      return respond({ error: "Activated invitations cannot be changed" }, 409);
    }
    email = String(existingInvitePayload.email || email).trim().toLowerCase();
    role = normalizeRole(existingInvitePayload.role || role);
    empId = String(existingInvitePayload.empId || existingInvite.subject_id || empId).trim();
    redirectTo = String(body.redirectTo || existingInvitePayload.redirectTo || "").trim();
    name = String(existingInvitePayload.name || name).trim();

    if (action === "cancel") {
      const authUserId = String(existingInvitePayload.authUserId || existingInvitePayload.auth_user_id || "").trim();
      if (authUserId) {
        const { data: authLookup, error: authLookupError } = await admin.auth.admin.getUserById(authUserId);
        if (authLookupError && !/not found/i.test(authLookupError.message || "")) {
          return respond({ error: "Pending auth invitation could not be verified" }, 500);
        }
        if (authLookup?.user?.email_confirmed_at || authLookup?.user?.confirmed_at) {
          return respond({ error: "Accepted invitations cannot be cancelled" }, 409);
        }
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(authUserId);
        if (deleteUserError && !/not found/i.test(deleteUserError.message || "")) {
          return respond({ error: "Pending auth invitation could not be revoked" }, 500);
        }
      }
      const timestamp = new Date().toISOString();
      const cancelledPayload = {
        ...existingInvitePayload,
        status: "Cancelled",
        inviteStatus: "Cancelled",
        activationStatus: "Cancelled",
        cancelledAt: timestamp,
        cancelledBy: callerData.user.id,
        authUserId: "",
        failureReason: "",
      };
      const { error: cancelInviteError } = await admin
        .from("hrms_identity_records")
        .update({ payload: cancelledPayload, updated_by: callerData.user.id, updated_at: timestamp })
        .eq("id", existingInviteRowId)
        .eq("tenant_id", callerTenant)
        .eq("organization_id", callerOrganization);
      if (cancelInviteError) return respond({ error: "Invite cancellation persistence failed" }, 500);

      const { data: employee, error: employeeLookupError } = await admin
        .from("hrms_employees")
        .select("id,payload")
        .eq("tenant_id", callerTenant)
        .eq("organization_id", callerOrganization)
        .eq("record_type", "employees")
        .eq("record_id", empId)
        .maybeSingle();
      if (employeeLookupError) return respond({ error: "Employee invite state lookup failed" }, 500);
      if (employee) {
        const employeePayload = isRecord(employee.payload) ? employee.payload : {};
        const { authUserId: _authUserId, auth_user_id: _authUserIdSnake, ...unlinkedEmployee } = employeePayload;
        const { error: employeeCancelError } = await admin
          .from("hrms_employees")
          .update({
            payload: {
              ...unlinkedEmployee,
              invitation_status: "Cancelled",
              inviteStatus: "Cancelled",
              activation_status: "Not Activated",
              activationStatus: "Not Activated",
            },
            updated_by: callerData.user.id,
            updated_at: timestamp,
          })
          .eq("id", employee.id)
          .eq("tenant_id", callerTenant)
          .eq("organization_id", callerOrganization);
        if (employeeCancelError) return respond({ error: "Employee invite cancellation failed" }, 500);
      }
      const { error: auditError } = await admin.from("hrms_audit_records").insert({
        tenant_id: callerTenant,
        organization_id: callerOrganization,
        record_type: "auditLogs",
        record_id: `AUTH-INVITE-CANCEL-${crypto.randomUUID()}`,
        subject_id: empId,
        payload: {
          actionType: "invite cancelled",
          module: "Authentication",
          targetId: inviteId,
          actorId: callerData.user.id,
          actorRole: callerRole,
          timestamp,
        },
        updated_by: callerData.user.id,
      });
      if (auditError) return respond({ error: "Invite cancellation audit failed" }, 500);
      return respond({ ok: true, action, inviteId, empId, status: "Cancelled" });
    }

    const priorAuthUserId = String(existingInvitePayload.authUserId || existingInvitePayload.auth_user_id || "").trim();
    if (priorAuthUserId) {
      const { data: priorAuthLookup, error: priorAuthLookupError } = await admin.auth.admin.getUserById(priorAuthUserId);
      if (priorAuthLookupError && !/not found/i.test(priorAuthLookupError.message || "")) {
        return respond({ error: "Previous invitation could not be verified for resend" }, 500);
      }
      if (priorAuthLookup?.user?.email_confirmed_at || priorAuthLookup?.user?.confirmed_at) {
        return respond({ error: "Accepted invitations cannot be resent" }, 409);
      }
      const { error: revokeError } = await admin.auth.admin.deleteUser(priorAuthUserId);
      if (revokeError && !/not found/i.test(revokeError.message || "")) {
        return respond({ error: "Previous invitation could not be revoked for resend" }, 500);
      }
    }
  }
  if (!email || !email.includes("@")) return respond({ error: "Valid email is required" }, 400);
  if (!assignableRoles.has(role)) return respond({ error: "Official tenant role is required" }, 400);
  if (!empId || !inviteId) return respond({ error: "Employee and invite identifiers are required" }, 400);
  if (redirectTo && !isAllowedRedirect(redirectTo)) return respond({ error: "Redirect origin is not allowed" }, 400);

  const { data: employeeRow, error: employeeError } = await admin
    .from("hrms_employees")
    .select("record_id,payload")
    .eq("tenant_id", callerTenant)
    .eq("organization_id", callerOrganization)
    .eq("record_type", "employees")
    .eq("record_id", empId)
    .maybeSingle();
  if (employeeError) return respond({ error: "Employee lookup failed" }, 500);
  if (!employeeRow) return respond({ error: "Employee not found for invite" }, 404);

  const employeePayload = isRecord(employeeRow.payload) ? employeeRow.payload : {};
  const currentEmployeeAuthUserId = String(employeePayload.auth_user_id || employeePayload.authUserId || "");
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo || undefined,
    data: { full_name: name, empId, inviteId },
  });
  if (error) return respond({ error: error.message }, 400);

  const authUserId = data.user?.id || "";
  if (!authUserId) return respond({ error: "Auth user was not created" }, 500);
  if (currentEmployeeAuthUserId && currentEmployeeAuthUserId !== authUserId && action !== "resend") {
    return respond({ error: "Employee is already linked to another auth account" }, 409);
  }

  const { error: updateUserError } = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      role,
      empId,
      emp_id: empId,
      tenantSlug: callerTenant,
      tenant_id: callerTenant,
      organizationId: callerOrganization,
      organization_id: callerOrganization,
      active: false,
      account_status: "invited",
      accountStatus: "invited",
      invitation_status: "sent",
      invitationStatus: "sent",
    },
    user_metadata: { full_name: name },
  });
  if (updateUserError) {
    await admin.auth.admin.deleteUser(authUserId);
    return respond({ error: "Auth metadata update failed" }, 500);
  }

  const timestamp = new Date().toISOString();
  const { error: employeeUpdateError } = await admin
    .from("hrms_employees")
    .update({
      payload: {
        ...employeePayload,
        auth_user_id: authUserId,
        authUserId,
        invitation_status: "Sent",
        activation_status: "Invite Sent",
        invite_sent_at: timestamp,
      },
      updated_by: callerData.user.id,
      updated_at: timestamp,
    })
    .eq("tenant_id", callerTenant)
    .eq("organization_id", callerOrganization)
    .eq("record_type", "employees")
    .eq("record_id", empId);
  if (employeeUpdateError) {
    await admin.auth.admin.deleteUser(authUserId);
    return respond({ error: "Employee invite state update failed" }, 500);
  }

  const { error: inviteError } = await admin.from("hrms_identity_records").upsert({
    tenant_id: callerTenant,
    organization_id: callerOrganization,
    record_type: "authInvites",
    record_id: inviteId,
    subject_id: empId,
    payload: {
      ...existingInvitePayload,
      inviteId,
      empId,
      email,
      role,
      status: "Sent",
      activationStatus: "Invite Sent",
      authUserId,
      redirectTo: redirectTo || null,
      invitedBy: callerData.user.id,
      invitedByRole: callerRole,
      sentAt: timestamp,
      resendCount: action === "resend" ? Number(existingInvitePayload.resendCount || 0) + 1 : Number(existingInvitePayload.resendCount || 0),
      lastResentAt: action === "resend" ? timestamp : String(existingInvitePayload.lastResentAt || ""),
      cancelledAt: "",
    },
    updated_by: callerData.user.id,
    updated_at: timestamp,
  }, { onConflict: "tenant_id,record_type,record_id" });
  if (inviteError) {
    await admin.auth.admin.deleteUser(authUserId);
    return respond({ error: "Invite record persistence failed" }, 500);
  }

  return respond({ ok: true, action, userId: authUserId, authUserId, email, role, empId, inviteId });
});

function normalizeRole(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeTenant(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAllowedRedirect(value: string): boolean {
  try { return allowedOrigins.has(new URL(value).origin); } catch { return false; }
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("Origin") || "";
  if (origin && !allowedOrigins.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(payload: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
