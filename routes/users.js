import { Router } from "express";
import multer from "multer";
import { supabaseAdmin } from "../supabaseClient.js";
import { requireAuth, requireProfile } from "../middleware/auth";
import { asyncHandler, parseId, unwrap, toApiUser, toApiProfile } from "../utils/helpers";
import { parse } from "dotenv";

const router = Router();

// ---------- file uploads ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const type = file.mimetype ?? file.mimeType ?? "";
    if (type.startsWith("image/")) return cb(null, true);
    const err = new Error("Only image files are allowed.");
    err.status = 400;
    cb(err);
  },
});

function fileToDataUrl(file) {
  const type = file.mimetype ?? file.mimeType;
  return `data:${type};base64,${file.buffer.toString("base64")}`;
}

function parseList(value) {
    if (value === undefined) return undefined;
    let list = value;
    if (typeof value === "string") {
        try { list = JSON.parse(value); } catch { return null; }
    }
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string")) return null;
    return list.map((item) => item.trim()).filter(Boolean);
}

const textRules = {
    firstName: { message: "First name is required.", valid: (v) => v !== "" },
    lastName: { message: "Last name is required.", valid: (v) => v !== "" },
    email: { message: "Enter a valid email address.", valid: (v) => /^\S+@\S+\.\S+$/.test(v) },
    major: { message: "Major is required.", valid: (v) => v !== "" },
    graduationYear: { message: "Graduation year must be 4 digits.", valid: (v) => /^\d{4}$/.test(v) },
    bio: { message: "", valid: () => true, optional: true },
};

// requireAll = true for POST, false for PUT (only what updated)
function readFields(body, { requireAll }) {
    const errors = [];
    const values = {};

    for (const [key, rule] of Object.entries(textRules)) {
        const raw = body[key];
        if (raw === undefined) {
            if (requireAll && !rule.optional) errors.push(rule.message);
            continue;
        }
        const value = String(raw).trim();
        if (rule.valid(value)) values[key] = value;
        else errors.push(rule.message);
    }

    for (const [key, label] of [["diningHalls", "Dining halls"], ["favoriteFoods", "Favorite foods"]]) {
        const list = parseList(body[key]);
        if (list === null) errors.push(`${label} must be a list of text values.`);
        else if (list !== undefined) values[key] = list;
    }

    return { values, errors };
}

// Translate validated camelCase into snake_case columns
function toColumns(v) {
    const cols = {};
    if (v.firstName !== undefined) cols.first_name = v.firstName;
    if (v.lastName !== undefined) cols.last_name = v.lastName;
    if (v.email !== undefined) cols.email = v.email;
    if (v.major !== undefined) cols.major = v.major;
    if (v.graduationYear !== undefined) cols.graduation_year = Number(v.graduationYear);
    if (v.bio !== undefined) cols.bio = v.bio;
    if (v.diningHalls !== undefined) cols.dining_halls = v.diningHalls;
    if (v.favoriteFoods !== undefined) cols.favorite_foods = v.favoriteFoods;
    return cols;
}

// ---------- GET /users/profiles (login required) ----------
router.get("/profiles", requireAuth, asyncHandler(async (req, res) => {
    const rows = unwrap(
        await supabaseAdmin.from("users").select("*, user_profiles ( date_of_birth, hometown, pronouns, instagram_handle, dietary_restrictions )").order("id")
    );

    res.json(rows.map((row) => {
        const p = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles;
        return { ...toApiUser(row), profile: toApiProfile(p) };
    }));
}));

// ---------- GET /users ----------
router.get("/", asyncHandler(async (req, res) => {
    const rows = unwrap(await supabaseAdmin.from("users").select("*").order("id"));
    res.json(rows.map(toApiUser));
}));

// ---------- GET /users/:id ----------
router.get("/:id", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });

    const row = unwrap(await supabaseAdmin.from("users").select("*").eq("id", id).maybeSingle());
    if (!row) return res.status(404).json({ error: "User not found." });
    res.json(toApiUser(row));
}))

// ---------- POST /users ----------
router.post("/", upload.single("image"), asyncHandler(async (req, res) => {
    const { values, errors } = readFields(req.body ?? {}, { requireAll: true });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(" ") });

    const row = unwrap(
        await supabaseAdmin.from("users").insert({
            ...toColumns(values),
            profile_picture_url: req.file ? fileToDataUrl(req.file) : null,
        }).select().single()
    );
    res.status(201).json(toApiUser(row));
}));

// ---------- PUT /users/:id ----------
router.put("/:id", upload.single("image"), asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });

    const body = req.body ?? {};
    const { values, errors } = readFields(body, { requireAll: false });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(" ") });

    const updates = { ...toColumns(values), updated_at: new Date().toISOString() };
    if (req.file) updates.profile_picture_url = fileToDataUrl(req.file);
    else if (body.removeImage === "true" || body.removeImage === true) updates.profile_picture_url = null;

    const row = unwrap(
        await supabaseAdmin.from("users").update(updates).eq("id", id).select().maybeSingle()
    );
    if (!row) return res.status(404).json({ error: "User not found." });
    res.json(toApiUser(row));
}));

// ---------- DELETE /users/:id ----------
router.delete("/:id", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });

    const deleted = unwrap(await supabaseAdmin.from("users").delete().eq("id", id).select("id"));
    if (deleted.length === 0) return res.status(404).json({ error: "User not found." });
    res.status(204).end();
}));

// ---------- PUT /users/:id/profile (login required) ----------
const profileTextFields = {
    hometown: ["hometown", 100],
    pronouns: ["pronouns", 50],
    instagramHandle: ["instagram_handle", 50],
};

router.put("/:id/profile", requireAuth, requireProfile, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id. "});
    if (req.profile.id !== id && req.profile.role !== "admin") {
        return res.status(403).json({ error: "You can only edit your own profile." });
    }

    const body = req.body ?? {};
    const updates = {};

    if (body.dateOfBirth !== undefined) {
        const dob = body.dateOfBirth;
        if (dob === null || dob === "") {
            updates.date_of_birth = null;
        } else if (
            !/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob)) || new Date(dob) > new Date()
        ) {
            return res.status(400).json({ error: "Date of birth must be a past date like 2005-04-23." });
        } else {
            updates.date_of_birth = dob;
        }
    }

    for (const [key, [column, max]] of Object.entries(profileTextFields)) {
        if (body[key] === undefined) continue;
        const value = String(body[key]).trim();
        if (value.length > max) return res.status(400).json({ error: `${key} is too long.` });
        updates[column] = value || null;
    }

    const restrictions = parseList(body.dietaryRestrictions);
    if (restrictions === null) return res.status(400).json({ error: "Dietary restrictions must be a list of text values. "});
    if (restrictions !== undefined) updates.dietary_restrictions = restrictions;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update. "});
    updates.updated_at = new Date().toISOString();

    const row = unwrap(
        await supabaseAdmin.from("user_profiles").upsert({ id, ...updates }).select().single()
    );
    res.json(toApiProfile(row));
}));

// ---------- GET /users/:id/connections ----------
router.get("/:id/connections", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id. "});

    const rows = unwrap(
        await supabaseAdmin.from("connections").select("created_at, connected:users!connected_user_id (*)").eq("user_id", id).order("created_at", { ascending: false })
    );
    res.json(rows.map((row) => toApiUser(row.connected)));
}));

// ---------- POST /users/:id/connections ----------
router.post("/:id/connections", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const otherId = parseId(req.body?.connectedUserId);
    if (!id || !otherId) return res.status(400).json({ error: "Invalid user id." });

    unwrap(
        await supabaseAdmin.from("connections").upsert(
            { user_id: id, connected_user_id: otherId },
            { onConflict: "user_id,connected_user_id", ignoreDuplicates: true }
        )
    );
    res.status(201).json({ userId: id, connectedUserId: otherId });
}));

// ---------- DELETE /users/:id/connections/:otherId ----------
router.delete("/:id/connections/:otherId", asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const otherId = parseId(req.params.otherId);
    if (!id || !otherId) return res.status(400).json({ error: "Invalid user id." });

    unwrap (await supabaseAdmin.from("connections").delete().eq("user_id", id).eq("connected_user_id", otherId));
    res.status(204).end();
}));

export default router;