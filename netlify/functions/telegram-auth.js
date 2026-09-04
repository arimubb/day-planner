const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function json(statusCode, data) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS"
        },
        body: JSON.stringify(data)
    };
}

function validateTelegramInitData(initData) {
    if (!initData) {
        return null;
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
        throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }

    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
        return null;
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(botToken)
        .digest();

    const calculatedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    if (calculatedHash !== receivedHash) {
        return null;
    }

    const authDate = Number(params.get("auth_date"));

    if (!authDate) {
        return null;
    }

    // Не принимаем слишком старые данные.
    const now = Math.floor(Date.now() / 1000);

    if (now - authDate > 86400) {
        return null;
    }

    const userString = params.get("user");

    if (!userString) {
        return null;
    }

    try {
        return {
            user: JSON.parse(userString),
            authDate
        };
    } catch {
        return null;
    }
}

exports.handler = async (event) => {
    if (event.httpMethod === "OPTIONS") {
        return json(204, {});
    }

    if (event.httpMethod !== "POST") {
        return json(405, {
            error: "Method not allowed"
        });
    }

    try {
        const body = JSON.parse(event.body || "{}");

        const initData = body.initData;

        if (!initData) {
            return json(400, {
                error: "Telegram initData is required"
            });
        }

        const telegramData = validateTelegramInitData(initData);

        if (!telegramData) {
            return json(401, {
                error: "Invalid Telegram initData"
            });
        }

        const telegramUser = telegramData.user;

        if (!telegramUser?.id) {
            return json(401, {
                error: "Telegram user not found"
            });
        }

        // Создаём пользователя или обновляем существующего
        const { data: databaseUser, error } = await supabase
            .from("telegram_users")
            .upsert(
                {
                    telegram_id: telegramUser.id,
                    first_name: telegramUser.first_name || "",
                    last_name: telegramUser.last_name || "",
                    username: telegramUser.username || "",
                    photo_url: telegramUser.photo_url || "",
                    updated_at: new Date().toISOString()
                },
                {
                    onConflict: "telegram_id"
                }
            )
            .select("*")
            .single();

        if (error) {
            console.error("Supabase user error:", error);

            return json(500, {
                error: "Failed to save Telegram user"
            });
        }

        return json(200, {
            success: true,
            user: {
                id: databaseUser.id,
                telegramId: databaseUser.telegram_id,
                firstName: databaseUser.first_name,
                lastName: databaseUser.last_name,
                username: databaseUser.username,
                photoUrl: databaseUser.photo_url
            }
        });

    } catch (error) {
        console.error("telegram-auth.js error:", error);

        return json(500, {
            error: "Internal server error"
        });
    }
};