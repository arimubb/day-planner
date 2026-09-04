const crypto = require("crypto");

/* =========================================================
   SESSION SECRET
========================================================= */

function getSessionSecret() {
    const secret =
        process.env.TELEGRAM_BOT_TOKEN;

    if (!secret) {
        throw new Error(
            "TELEGRAM_BOT_TOKEN is not configured"
        );
    }

    return secret;
}

/* =========================================================
   CREATE SESSION TOKEN
========================================================= */

function createSessionToken(userId) {
    const payload = {
        userId,
        createdAt: Date.now()
    };

    const payloadString =
        Buffer
            .from(
                JSON.stringify(payload)
            )
            .toString("base64url");

    const signature =
        crypto
            .createHmac(
                "sha256",
                getSessionSecret()
            )
            .update(payloadString)
            .digest("base64url");

    return `${payloadString}.${signature}`;
}

/* =========================================================
   VERIFY SESSION TOKEN
========================================================= */

function verifySessionToken(token) {
    if (!token) {
        return null;
    }

    const parts =
        token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const [
        payloadString,
        receivedSignature
    ] = parts;

    const expectedSignature =
        crypto
            .createHmac(
                "sha256",
                getSessionSecret()
            )
            .update(payloadString)
            .digest("base64url");

    const receivedBuffer =
        Buffer.from(
            receivedSignature
        );

    const expectedBuffer =
        Buffer.from(
            expectedSignature
        );

    if (
        receivedBuffer.length !==
        expectedBuffer.length
    ) {
        return null;
    }

    if (
        !crypto.timingSafeEqual(
            receivedBuffer,
            expectedBuffer
        )
    ) {
        return null;
    }

    try {
        const payload =
            JSON.parse(
                Buffer
                    .from(
                        payloadString,
                        "base64url"
                    )
                    .toString("utf8")
            );

        if (!payload.userId) {
            return null;
        }

        if (!payload.createdAt) {
            return null;
        }

        const sessionAge =
            Date.now() -
            Number(payload.createdAt);

        // Сессия действует 24 часа
        if (
            sessionAge >
            86400000
        ) {
            return null;
        }

        if (sessionAge < 0) {
            return null;
        }

        return {
            userId: payload.userId
        };

    } catch {
        return null;
    }
}

/* =========================================================
   GET COOKIE
========================================================= */

function getCookie(event, name) {
    const cookieHeader =
        event.headers?.cookie ||
        event.headers?.Cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader.split(";");

    for (const cookie of cookies) {
        const [key, ...valueParts] =
            cookie.trim().split("=");

        if (key === name) {
            return decodeURIComponent(
                valueParts.join("=")
            );
        }
    }

    return null;
}

/* =========================================================
   GET SESSION TOKEN
========================================================= */

function getSessionToken(event) {
    /*
     * 1. Сначала Authorization Bearer
     *
     * Это используется текущим app.js.
     */

    const authorization =
        event.headers?.authorization ||
        event.headers?.Authorization;

    if (authorization) {
        if (
            authorization.startsWith(
                "Bearer "
            )
        ) {
            const token =
                authorization
                    .slice(7)
                    .trim();

            if (token) {
                return token;
            }
        }
    }

    /*
     * 2. Если Bearer нет —
     * берём session из cookie.
     *
     * Это нужно для PWA,
     * установленной на iPhone.
     */

    return getCookie(
        event,
        "dayPlannerSession"
    );
}

/* =========================================================
   EXPORT
========================================================= */

module.exports = {
    createSessionToken,
    verifySessionToken,
    getSessionToken
};