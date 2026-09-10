function json(statusCode, data) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    };
}

async function sendMessage(chatId, text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const appUrl = process.env.TELEGRAM_MINI_APP_URL;

    if (!botToken || !appUrl) {
        throw new Error(
            "TELEGRAM_BOT_TOKEN and TELEGRAM_MINI_APP_URL are required"
        );
    }

    const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: "📅 Открыть планировщик",
                            web_app: {
                                url: appUrl
                            }
                        }
                    ]]
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            `Telegram API returned ${response.status}`
        );
    }
}

exports.handler = async event => {
    if (event.httpMethod !== "POST") {
        return json(405, {
            error: "Method not allowed"
        });
    }

    let update;

    try {
        update = JSON.parse(event.body || "{}");
    } catch {
        return json(400, {
            error: "Invalid JSON"
        });
    }

    const message = update.message;
    const text = message?.text || "";

    if (message?.chat?.id && text.startsWith("/start")) {
        try {
            await sendMessage(
                message.chat.id,
                "Откройте Day Planner:"
            );
        } catch (error) {
            console.error("telegram-bot.js error:", error);
            return json(500, {
                error: "Failed to send Telegram message"
            });
        }
    }

    return json(200, {
        ok: true
    });
};
