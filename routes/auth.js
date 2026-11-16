import { Router } from "express";
import { newAuthClient } from "../supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/helpers.js";

const router = Router();

// POST /auth/singup    { "email": "...", "password": "..."}
router.post("/signup", asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const { data, error } = await newAuthClient().auth.signUp({ email, password });
    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({
        user: { id: data.user?.id, email: data.user?.email },
        accessToken: data.session?.access_token ?? null,
        message: data.session ? "Signed up." : "Check your email to confirm your account.",
    });
}));

// POST /auth/login     { "email": "...", "password": "..." }
router.post("/login", asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    const { data, error } = await newAuthClient().auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: "Incorrect email or password. "});

    res.json({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
    });
}));

// GET /auth/me: who am I?
router.get("/me", requireAuth, (req, res) => {
    res.json({ email: req.authUser.email, profile: req.profile });
});

export default router;