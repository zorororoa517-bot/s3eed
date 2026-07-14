// netlify/functions/discord-callback.js
//
// هذا الملف هو "الوسيط" المجاني بين ديسكورد و Firebase.
// شغلته: يستقبل كود الدخول من ديسكورد، يبدّله ببيانات المستخدم،
// وبعدين يصنع Custom Token من Firebase Admin SDK (مجاني بالكامل، بدون Blaze)
// ويرجّع المستخدم لموقعك مع التوكن باش يسجّل دخوله.

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  // متغير البيئة FIREBASE_SERVICE_ACCOUNT_BASE64 لازم يكون ملف مفتاح الخدمة
  // (Service Account JSON) مشفّر بصيغة base64 — نشرحلك تحت كيف تسويه
  const json = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
    "base64"
  ).toString("utf8");
  const serviceAccount = JSON.parse(json);
  return initializeApp({ credential: cert(serviceAccount) });
}

exports.handler = async (event) => {
  const siteUrl = process.env.SITE_URL; // مثال: https://s3eed.netlify.app
  const code = event.queryStringParameters && event.queryStringParameters.code;

  if (!code) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/index.html#discordError=missing_code` },
    };
  }

  try {
    // 1) نبدّل الـ code بـ access_token من ديسكورد
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("discord_token_exchange_failed");
    }

    // 2) نجيب بيانات المستخدم من ديسكورد
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    if (!discordUser || !discordUser.id) {
      throw new Error("discord_user_fetch_failed");
    }

    // 3) نصنع Firebase Custom Token مربوط بمعرّف ثابت لكل مستخدم ديسكورد
    getAdminApp();
    const uid = `discord:${discordUser.id}`;
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const customToken = await getAuth().createCustomToken(uid, {
      provider: "discord",
      username: discordUser.username,
      avatar: avatarUrl,
      email: discordUser.email || null,
    });

    // 4) نرجّع المستخدم لموقعك مع التوكن (بالـ hash عشان ما يتسجل بالسيرفر لوجز)
    return {
      statusCode: 302,
      headers: {
        Location: `${siteUrl}/index.html#discordToken=${customToken}`,
      },
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: {
        Location: `${siteUrl}/index.html#discordError=${encodeURIComponent(
          err.message
        )}`,
      },
    };
  }
};
