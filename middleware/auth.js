import { supabaseAdmin } from "../supabaseClient.js";

const PROFILE_COLUMNS = "id, email, role, auth_id";

export async function requireAuth(req, res, next) {
    try {
        // Pull token out of "Authorization: Bearer <token>"
        const header = req.headers.authorization ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: "You must be logged in." });

        // Ask Supabase if token real + unexpired
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user ) {
            return res.status(401).json({ error: "Invalid or expired login." });
        }
        const authUser = data.user;

        // Find matching row in users table
        const { data: profile, error: lookupError } = await supabaseAdmin.from("users").select(PROFILE_COLUMNS).eq("auth_id", authUser.id).maybeSingle();
        if (lookupError) throw lookupError;
        let me = profile;

        // First login -> claim existing profile w/ same email
        if (!me && authUser.email) {
            const { data: linked, error: linkError } = await supabaseAdmin.from("users").update({ auth_id: authUser.id }).eq("email", authUser.email.toLowerCase()).is("auth_id", null).select(PROFILE_COLUMNS).maybeSingle();
            if (linkError) throw linkError;
            me = linked;
        }

        req.authUser = authUser;    // Supabase login
        req.profile = me;           // row in users table (or null if none yet)
        next();
    } catch (err) {
        next(err);
    }
}

export function requireProfile(req, res, next) {
    if (!req.profile) {
        return res.status(403).json({ error: "Create your profile first." });
    }
    next();
}

export function requireAdmin(req, res, next) {
    if (req.profile?.role !== "admin") {
        return res.status(403).json({ error: "Admins only." });
    }
    next();
}