const { createClient } = require("@supabase/supabase-js");

const {
    getAnonymousUser
} = require("../lib/anonymous-user");

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
                "Content-Type",
            "Access-Control-Allow-Methods":
                "POST, OPTIONS"
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
            error:
                "Method not allowed"
        });
    }

    try {

        const {
            user,
            setCookie
        } = await getAnonymousUser(event);

        /* ============================================
           ПОЛУЧАЕМ ID ЗАДАЧИ
        ============================================ */

        const taskId =
            event.queryStringParameters
                ?.id;

        if (!taskId) {
            return json(400, {
                error:
                    "Task id is required"
            });
        }

        /* ============================================
           ПОЛУЧАЕМ ДАТУ
        ============================================ */

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

        const date =
            body.date;

        if (!date) {
            return json(400, {
                error:
                    "Completion date is required"
            });
        }

        /* ============================================
           НАХОДИМ ЗАДАЧУ
        ============================================ */

        const {
            data: task,
            error: taskError
        } = await supabase
            .from("tasks")
            .select("*")
            .eq(
                "id",
                taskId
            )
            .eq(
                "app_user_id",
                user.id
            )
            .single();

        if (
            taskError ||
            !task
        ) {
            return json(404, {
                error:
                    "Task not found"
            });
        }

        /* ============================================
           МЕНЯЕМ СТАТУС ВЫПОЛНЕНИЯ
        ============================================ */

        let completedDates =
            Array.isArray(
                task.completed_dates
            )
                ? [
                    ...task.completed_dates
                ]
                : [];

        const index =
            completedDates.indexOf(
                date
            );

        let completed;

        if (index === -1) {

            completedDates.push(
                date
            );

            completed = true;

        } else {

            completedDates.splice(
                index,
                1
            );

            completed = false;

        }

        /* ============================================
           СОХРАНЯЕМ
        ============================================ */

        const {
            data: updatedTask,
            error: updateError
        } = await supabase
            .from("tasks")
            .update({
                completed_dates:
                    completedDates,

                updated_at:
                    new Date()
                        .toISOString()
            })
            .eq(
                "id",
                taskId
            )
            .eq(
                "app_user_id",
                user.id
            )
            .select("*")
            .single();

        if (updateError) {

            console.error(
                "Complete task error:",
                updateError
            );

            return json(500, {
                error:
                    "Failed to update task"
            });
        }

        const response = json(200, {

            success: true,

            completed,

            completedDates:
                updatedTask
                    .completed_dates || []

        });

        if (setCookie) {
            response.headers["Set-Cookie"] = setCookie;
        }

        return response;

    } catch (error) {

        console.error(
            "complete-task.js error:",
            error
        );

        return json(500, {
            error:
                "Internal server error"
        });

    }
};