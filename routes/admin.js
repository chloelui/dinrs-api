import { Router } from "express";
import { supabaseAdmin } from "../supabaseClient.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncHandler, parseId, unwrap } from "../utils/helpers.js";

const router = Router();

// All routes require login and admin role
router.use(requireAuth, requireAdmin);

// GET /admin/users: account overview
router.get("/users", asyncHandler(async (req, res) => {
  const rows = unwrap(
    await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email, role, auth_id, created_at")
      .order("id")
  );
  res.json(rows.map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    email: r.email,
    role: r.role,
    hasLogin: r.auth_id !== null,
    createdAt: r.created_at,
  })));
}));

// PATCH /admin/users/:id/role { "role": "admin" | "user" }
router.patch("/users/:id/role", asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const role = req.body?.role;
  if (!id) return res.status(400).json({ error: "Invalid user id." });
  if (!["user", "admin"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'user' or 'admin'." });
  }

  const row = unwrap(
    await supabaseAdmin.from("users").update({ role }).eq("id", id).select("id, role").maybeSingle()
  );
  if (!row) return res.status(404).json({ error: "User not found." });
  res.json(row);
}));

// DELETE /admin/users/:id: remove profile AND login account
router.delete("/users/:id", asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid user id." });

  const row = unwrap(
    await supabaseAdmin.from("users").select("id, auth_id").eq("id", id).maybeSingle()
  );
  if (!row) return res.status(404).json({ error: "User not found." });

  unwrap(await supabaseAdmin.from("users").delete().eq("id", id));
  if (row.auth_id) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(row.auth_id);
    if (error) console.error("Profile deleted but login removal failed:", error.message);
  }
  res.status(204).end();
}));

export default router;