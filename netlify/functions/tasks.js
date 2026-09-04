const { createClient } = require("@supabase/supabase-js");

const {
    verifySessionToken,
    getSessionToken
} = require("../lib/auth");

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
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization",
            "Access-Control-Allow-Methods":
                "GET, POST, PUT, DELETE, OPTIONS"
        },
        body: JSON.stringify(data)
    };
}

async function getDatabaseUser(userId) {
    const {
        data,
        error
    } = await supabase
        .from("telegram_users")
        .select("id, telegram_id")
        .eq("id", userId)
        .single();

    if (error || !data) {
        return null;
    }

    return data;
}

function normalizeTask(task) {
    return {
        id: String(task.id),

        title: task.title,

        description:
            task.description || "",

        date:
            task.task_date,

        time:
            task.task_time
                ? String(task.task_time).slice(0, 5)
                : "",

        repeat:
            task.repeat || "none",

        repeatDays:
            Array.isArray(task.repeat_days)
                ? task.repeat_days
                : [],

        completedDates:
            Array.isArray(task.completed_dates)
                ? task.completed_dates
                : [],

        createdAt:
            task.created_at,

        updatedAt:
            task.updated_at
    };
}

exports.handler = async (event) => {

    if (
        event.httpMethod ===
        "OPTIONS"
    ) {
        return json(204, {});
    }

    try {

        /* ============================================
           ПРОВЕРЯЕМ СЕССИЮ
        ============================================ */

        const sessionToken =
            getSessionToken(event);

        const session =
            verifySessionToken(
                sessionToken
            );

        if (!session) {
            return json(401, {
                error:
                    "Invalid or expired session"
            });
        }

        const user =
            await getDatabaseUser(
                session.userId
            );

        if (!user) {
            return json(401, {
                error:
                    "Telegram user not found"
            });
        }

        /* ============================================
           GET — ПОЛУЧИТЬ ЗАДАЧИ
        ============================================ */

        if (
            event.httpMethod ===
            "GET"
        ) {

            const {
                data,
                error
            } = await supabase
                .from("tasks")
                .select("*")
                .eq(
                    "telegram_user_id",
                    user.id
                )
                .order(
                    "task_date",
                    {
                        ascending: true
                    }
                )
                .order(
                    "task_time",
                    {
                        ascending: true,
                        nullsFirst: false
                    }
                );

            if (error) {

                console.error(
                    "GET tasks error:",
                    error
                );

                return json(500, {
                    error:
                        "Failed to load tasks"
                });
            }

            return json(200, {
                tasks:
                    (data || [])
                        .map(
                            normalizeTask
                        )
            });
        }

        /* ============================================
           POST — СОЗДАТЬ ЗАДАЧУ
        ============================================ */

        if (
            event.httpMethod ===
            "POST"
        ) {

            let body;

            try {

                body =
                    JSON.parse(
                        event.body || "{}"
                    );

            } catch {

                return json(400, {
                    error:
                        "Invalid JSON"
                });

            }

            const title =
                String(
                    body.title || ""
                ).trim();

            if (!title) {

                return json(400, {
                    error:
                        "Task title is required"
                });

            }

            if (!body.date) {

                return json(400, {
                    error:
                        "Task date is required"
                });

            }

            const repeat =
                body.repeat || "none";

            const repeatDays =
                Array.isArray(
                    body.repeatDays
                )
                    ? body.repeatDays
                    : [];

            const taskData = {

                telegram_user_id:
                    user.id,

                title,

                description:
                    String(
                        body.description || ""
                    ),

                task_date:
                    body.date,

                task_time:
                    body.time || null,

                repeat,

                repeat_days:
                    repeatDays,

                completed_dates:
                    []

            };

            const {
                data,
                error
            } = await supabase
                .from("tasks")
                .insert(taskData)
                .select("*")
                .single();

            if (error) {

                console.error(
                    "POST tasks error:",
                    error
                );

                return json(500, {
                    error:
                        "Failed to create task"
                });
            }

            return json(201, {
                task:
                    normalizeTask(data)
            });
        }

        /* ============================================
           PUT — ИЗМЕНИТЬ ЗАДАЧУ
        ============================================ */

        if (
            event.httpMethod ===
            "PUT"
        ) {

            const taskId =
                event.queryStringParameters
                    ?.id;

            if (!taskId) {

                return json(400, {
                    error:
                        "Task id is required"
                });

            }

            let body;

            try {

                body =
                    JSON.parse(
                        event.body || "{}"
                    );

            } catch {

                return json(400, {
                    error:
                        "Invalid JSON"
                });

            }

            const updateData = {};

            if (
                body.title !==
                undefined
            ) {

                const title =
                    String(
                        body.title
                    ).trim();

                if (!title) {

                    return json(400, {
                        error:
                            "Task title cannot be empty"
                    });

                }

                updateData.title =
                    title;
            }

            if (
                body.description !==
                undefined
            ) {

                updateData.description =
                    String(
                        body.description ||
                        ""
                    );
            }

            if (
                body.date !==
                undefined
            ) {

                updateData.task_date =
                    body.date;
            }

            if (
                body.time !==
                undefined
            ) {

                updateData.task_time =
                    body.time || null;
            }

            if (
                body.repeat !==
                undefined
            ) {

                updateData.repeat =
                    body.repeat;
            }

            if (
                body.repeatDays !==
                undefined
            ) {

                updateData.repeat_days =
                    Array.isArray(
                        body.repeatDays
                    )
                        ? body.repeatDays
                        : [];
            }

            updateData.updated_at =
                new Date()
                    .toISOString();

            const {
                data,
                error
            } = await supabase
                .from("tasks")
                .update(updateData)
                .eq("id", taskId)
                .eq(
                    "telegram_user_id",
                    user.id
                )
                .select("*")
                .single();

            if (
                error ||
                !data
            ) {

                console.error(
                    "PUT tasks error:",
                    error
                );

                return json(404, {
                    error:
                        "Task not found"
                });

            }

            return json(200, {
                task:
                    normalizeTask(data)
            });
        }

        /* ============================================
           DELETE — УДАЛИТЬ ЗАДАЧУ
        ============================================ */

        if (
            event.httpMethod ===
            "DELETE"
        ) {

            const taskId =
                event.queryStringParameters
                    ?.id;

            if (!taskId) {

                return json(400, {
                    error:
                        "Task id is required"
                });

            }

            const {
                data,
                error
            } = await supabase
                .from("tasks")
                .delete()
                .eq("id", taskId)
                .eq(
                    "telegram_user_id",
                    user.id
                )
                .select("id")
                .single();

            if (
                error ||
                !data
            ) {

                console.error(
                    "DELETE tasks error:",
                    error
                );

                return json(404, {
                    error:
                        "Task not found"
                });

            }

            return json(200, {

                success: true,

                id:
                    String(data.id)

            });
        }

        return json(405, {
            error:
                "Method not allowed"
        });

    } catch (error) {

        console.error(
            "tasks.js error:",
            error
        );

        return json(500, {
            error:
                "Internal server error"
        });

    }
};