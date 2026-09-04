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

function getTelegramUserId(event) {
    return (
        event.headers?.["x-telegram-user-id"] ||
        event.headers?.["X-Telegram-User-Id"]
    );
}

async function getDatabaseUser(telegramId) {
    const { data, error } = await supabase
        .from("telegram_users")
        .select("id")
        .eq("telegram_id", telegramId)
        .single();

    if (error || !data) {
        return null;
    }

    return data;
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
        const telegramId = getTelegramUserId(event);

        if (!telegramId) {
            return json(401, {
                error: "Telegram user is not authenticated"
            });
        }

        const user = await getDatabaseUser(telegramId);

        if (!user) {
            return json(401, {
                error: "Telegram user not found"
            });
        }

        const taskId = event.queryStringParameters?.id;

        if (!taskId) {
            return json(400, {
                error: "Task id is required"
            });
        }

        let body;

        try {
            body = JSON.parse(event.body || "{}");
        } catch {
            return json(400, {
                error: "Invalid JSON"
            });
        }

        const date = body.date;

        if (!date) {
            return json(400, {
                error: "Completion date is required"
            });
        }

        // Получаем задачу только этого пользователя
        const { data: task, error: taskError } = await supabase
            .from("tasks")
            .select("*")
            .eq("id", taskId)
            .eq("telegram_user_id", user.id)
            .single();

        if (taskError || !task) {
            return json(404, {
                error: "Task not found"
            });
        }

        let completedDates = Array.isArray(task.completed_dates)
            ? [...task.completed_dates]
            : [];

        const index = completedDates.indexOf(date);

        let completed;

        if (index === -1) {
            completedDates.push(date);
            completed = true;
        } else {
            completedDates.splice(index, 1);
            completed = false;
        }

        const { data: updatedTask, error: updateError } = await supabase
            .from("tasks")
            .update({
                completed_dates: completedDates,
                updated_at: new Date().toISOString()
            })
            .eq("id", taskId)
            .eq("telegram_user_id", user.id)
            .select("*")
            .single();

        if (updateError) {
            console.error(updateError);

            return json(500, {
                error: "Failed to update task"
            });
        }

        return json(200, {
            success: true,
            completed,
            completedDates: updatedTask.completed_dates || []
        });

    } catch (error) {
        console.error("complete-task.js error:", error);

        return json(500, {
            error: "Internal server error"
        });
    }
};