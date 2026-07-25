// functions/discord-callback.js  (Cloudflare Pages Function)
//
// نفس شغل ملف discord-callback.js اللي كان على Netlify، بس بصيغة Cloudflare Pages
// (اللي تشتغل على بيئة Workers، مو Node.js، فما نقدر نستخدم مكتبة firebase-admin التقليدية).
// بدلها نستخدم مكتبة "jose" الخفيفة عشان نبني ونوقّع رمز Firebase Custom Token يدويًا.

import { SignJWT, importPKCS8 } from "jose";

async function createFirebaseCustomToken(serviceAccount, uid, claims) {
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ uid, claims })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit")
    .sign(privateKey);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const siteUrl = (env.SITE_URL || url.origin).replace(/\/$/, "");

  if (!code) {
    return Response.redirect(`${siteUrl}/index.html#discordError=missing_code`, 302);
  }

  try {
    // 1) نبدّل الـ code بـ access_token من ديسكورد
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      const diag = {
        clientIdLen: (env.DISCORD_CLIENT_ID || "").length,
        clientIdPreview: (env.DISCORD_CLIENT_ID || "").slice(0, 4) + "..." + (env.DISCORD_CLIENT_ID || "").slice(-4),
        secretLen: (env.DISCORD_CLIENT_SECRET || "").length,
        secretHasWhitespace: /\s/.test(env.DISCORD_CLIENT_SECRET || ""),
        redirectUri: env.DISCORD_REDIRECT_URI || "",
      };
      throw new Error("discord_token_exchange_failed: " + JSON.stringify(tokenData) + " | DIAG:" + JSON.stringify(diag));
    }

    // 2) نجيب بيانات المستخدم من ديسكورد
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    if (!discordUser || !discordUser.id) throw new Error("discord_user_fetch_failed");

    // 3) نصنع Firebase Custom Token يدويًا (بدل SDK اللي ما يشتغل على Workers)
    const serviceAccountJson = atob(env.FIREBASE_SERVICE_ACCOUNT_BASE64);
    const serviceAccount = JSON.parse(serviceAccountJson);
    const uid = `discord:${discordUser.id}`;
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const customToken = await createFirebaseCustomToken(serviceAccount, uid, {
      provider: "discord",
      username: discordUser.username,
      avatar: avatarUrl,
      email: discordUser.email || null,
    });

    // 4) نرجّع المستخدم لموقعك مع التوكن
    return Response.redirect(`${siteUrl}/index.html#discordToken=${customToken}`, 302);
  } catch (err) {
    return Response.redirect(`${siteUrl}/index.html#discordError=${encodeURIComponent(err.message)}`, 302);
  }
}
