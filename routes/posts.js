import { Router } from "express";
import { supabaseAdmin } from "../supabaseClient.js";
import { requireAuth, requireProfile } from "../middleware/auth.js";
import { asyncHandler, parseId, unwrap } from "../utils/helpers.js";

const router = Router();

const POST_SELECT = "id, content, created_at, author_id, author:users!author_id ( id, first_name, last_name, profile_picture_url )";

function toApiPost(row) {
    const a = row.author;
    return {
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        author : a ? { id: a.id, name: `${a.first_name} ${a.last_name}`, profilePicture: a.profile_picture_url } : null,
    };
}

// GET /posts: anyone can read, newest first
router.get("/", asyncHandler(async (req, res) => {
    const rows = unwrap(await supabaseAdmin.from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(50));
    res.json(rows.map(toApiPost));
}));

// POST /posts { "content": "..." }: logged in + has profile
router.post("/", requireAuth, requireProfile, asyncHandler(async (req, res) => {
  const content = String(req.body?.content ?? "").trim();
  if (content.length < 1 || content.length > 1000) {
    return res.status(400).json({ error: "Post must be 1 to 1000 characters." });
  }

  const row = unwrap(
    await supabaseAdmin.from("posts").insert({ author_id: req.profile.id, content }).select(POST_SELECT).single()
  );
  res.status(201).json(toApiPost(row));
}));

// DELETE /posts/:id: the author or an admin
router.delete("/:id", requireAuth, requireProfile, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid post id." });

  const post = unwrap(
    await supabaseAdmin.from("posts").select("id, author_id").eq("id", id).maybeSingle()
  );
  if (!post) return res.status(404).json({ error: "Post not found." });

  if (post.author_id !== req.profile.id && req.profile.role !== "admin") {
    return res.status(403).json({ error: "You can only delete your own posts." });
  }

  unwrap(await supabaseAdmin.from("posts").delete().eq("id", id));
  res.status(204).end();
}));

export default router;