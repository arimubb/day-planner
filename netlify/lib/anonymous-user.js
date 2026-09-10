const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COOKIE_NAME = "day_planner_user";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function getCookie(event) {
    const header =
        event.headers?.cookie ||
        event.headers?.Cookie ||
        "";

    const cookie = header
        .split(";")
        .map(value => value.trim())
        .find(value => value.startsWith(`${COOKIE_NAME}=`));

    return cookie
        ? decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1))
        : null;
}

function hashKey(key) {
    return crypto
        .createHash("sha256")
        .update(key)
        .digest("hex");
}

async function getAnonymousUser(event) {
    const rawKey = getCookie(event);

    if (rawKey) {
        const { data, error } = await supabase
            .from("app_users")
            .select("id")
            .eq("browser_key_hash", hashKey(rawKey))
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (data) {
            return {
                user: data,
                setCookie: null
            };
        }
    }

    const newKey = crypto.randomBytes(32).toString("hex");
    const { data, error } = await supabase
        .from("app_users")
        .insert({
            browser_key_hash: hashKey(newKey)
        })
        .select("id")
        .single();

    if (error || !data) {
        throw error || new Error("Failed to create application user");
    }

    return {
        user: data,
        setCookie: `${COOKIE_NAME}=${encodeURIComponent(newKey)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
    };
}

module.exports = {
    getAnonymousUser
};
