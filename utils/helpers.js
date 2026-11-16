// Lets async route functions throw errors that Express can catch
export const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Supabase doesn't throw errors, unwrap error into throw
export function unwrap({ data, error }) {
    if (error) throw error;
    return data;
}

export function toApiUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    major: row.major,
    graduationYear: String(row.graduation_year),
    bio: row.bio,
    profilePicture: row.profile_picture_url,
    diningHalls: row.dining_halls,
    favoriteFoods: row.favorite_foods,
    createdAt: row.created_at,
  };
}

export function toApiProfile(p) {
    return {
        dateOfBirth: p?.date_of_birth ?? null,
        hometown: p?.hometown ?? null,
        pronouns: p?.pronouns ?? null,
        instagramHandle: p?.instagram_handle ?? null,
        dietaryRestrictions: p?.dietary_restrictions ?? [],
    };
}