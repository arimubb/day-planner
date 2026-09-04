const { createClient } = require("@supabase/supabase-js");

const {
    createSessionToken
} = require("../lib/auth");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function json(statusCode, data, extraHeaders = {}) {
    return {
        statusCode,

        headers: {
            "Content-Type": "application/json",

            "Access-Control-Allow-Origin": "*",

            "Access-Control-Allow-Headers":
                "Content-Type",

            "Access-Control-Allow-Methods":
                "POST, OPTIONS",

            ...extraHeaders
        },

        body: JSON.stringify(data)
    };
}

exports.handler = async (event) => {

    if (
        event.httpMethod ===
        "OPTIONS"
    ) {
        return json(204, {});
    }

    if (
        event.httpMethod !==
        "POST"
    ) {
        return json(405, {
            error: "Method not allowed"
        });
    }

    try {

        let body;

        try {

            body =
                JSON.parse(
                    event.body || "{}"
                );

        } catch {

            return json(400, {
                error: "Invalid JSON"
            });

        }

        const code =
            String(
                body.code || ""
            ).trim();

        if (!code) {

            return json(400, {
                error:
                    "Handoff code is required"
            });

        }

        /*
         * Находим одноразовый код
         */

        const {
            data: handoff,
            error
        } = await supabase
            .from("telegram_handoffs")
            .select("*")
            .eq("code", code)
            .is("used_at", null)
            .single();

        if (
            error ||
            !handoff
        ) {

            return json(401, {
                error:
                    "Invalid or already used handoff"
            });

        }

        /*
         * Проверяем срок действия.
         * Код действует 5 минут.
         */

        const createdAt =
            new Date(
                handoff.created_at
            ).getTime();

        const age =
            Date.now() -
            createdAt;

        if (
            age >
            5 * 60 * 1000
        ) {

            return json(401, {
                error:
                    "Handoff code expired"
            });

        }

        if (age < 0) {

            return json(401, {
                error:
                    "Invalid handoff time"
            });

        }

        /*
         * Помечаем код использованным
         */

        const {
            error: updateError
        } = await supabase
            .from("telegram_handoffs")
            .update({
                used_at:
                    new Date().toISOString()
            })
            .eq(
                "id",
                handoff.id
            )
            .is(
                "used_at",
                null
            );

        if (updateError) {

            console.error(
                "Handoff update error:",
                updateError
            );

            return json(500, {
                error:
                    "Failed to use handoff"
            });

        }

        /*
         * Создаём новую сессию
         */

        const sessionToken =
            createSessionToken(
                handoff.telegram_user_id
            );

        /*
         * Получаем пользователя
         */

        const {
            data: user,
            error: userError
        } = await supabase
            .from("telegram_users")
            .select("*")
            .eq(
                "id",
                handoff.telegram_user_id
            )
            .single();

        if (
            userError ||
            !user
        ) {

            return json(401, {
                error:
                    "Telegram user not found"
            });

        }

        /*
         * Cookie:
         *
         * Secure
         * HttpOnly
         * SameSite=Lax
         * Path=/
         * Max-Age=24 часа
         */

        const sessionCookie =
            [
                `dayPlannerSession=${encodeURIComponent(sessionToken)}`,
                "Path=/",
                "Max-Age=86400",
                "HttpOnly",
                "Secure",
                "SameSite=Lax"
            ].join("; ");

        return json(
            200,
            {
                success: true,

                sessionToken,

                user: {
                    id: user.id,

                    telegramId:
                        user.telegram_id,

                    firstName:
                        user.first_name,

                    lastName:
                        user.last_name,

                    username:
                        user.username,

                    photoUrl:
                        user.photo_url
                }
            },
            {
                "Set-Cookie":
                    sessionCookie
            }
        );

    } catch (error) {

        console.error(
            "exchange-handoff.js error:",
            error
        );

        return json(500, {
            error:
                "Internal server error"
        });

    }
};