const crypto = require("crypto");

function getSessionSecret() {
    const secret = process.env.TELEGRAM_BOT_TOKEN;

    if (!secret) {
        throw new Error(
            "TELEGRAM_BOT_TOKEN is not configured"
        );
    }

    return secret;
}

function verifySessionToken(token) {
    if (!token) {
        return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
        return null;
    }

    const [payloadString, receivedSignature] = parts;

    const expectedSignature = crypto
        .createHmac(
            "sha256",
            getSessionSecret()
        )
        .update(payloadString)
        .digest("base64url");

    const receivedBuffer =
        Buffer.from(receivedSignature);

    const expectedBuffer =
        Buffer.from(expectedSignature);

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
        const payload = JSON.parse(
            Buffer
                .from(payloadString, "base64url")
                .toString("utf8")
        );

        if (!payload.userId) {
            return null;
        }

        const sessionAge =
            Date.now() - Number(payload.createdAt);

        // Сессия действует 24 часа
        if (sessionAge > 86400000) {
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

function getSessionToken(event) {
    const authorization =
        event.headers?.authorization ||
        event.headers?.Authorization;

    if (!authorization) {
        return null;
    }

    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {
        return null;
    }

    return authorization.slice(7).trim();
}

module.exports = {
    verifySessionToken,
    getSessionToken
};