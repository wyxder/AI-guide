import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 魔珐星云具身智能体凭证下发。
 *
 * SDK 按官方文档要求需要在浏览器侧携带 App ID / App Secret 建立会话，
 * 因此这里仅做同源、不缓存的运行时下发：密钥本体保存在 .env（服务端读取），
 * 不写入任何 NEXT_PUBLIC_ 变量，也不会出现在前端构建产物中。
 */
export async function GET() {
  const appId = process.env.XINGYUN_APP_ID;
  const appSecret = process.env.XINGYUN_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json({ error: "魔珐星云密钥未配置" }, { status: 503 });
  }

  return NextResponse.json(
    {
      appId,
      appSecret,
      gatewayServer:
        process.env.XINGYUN_GATEWAY_SERVER || "https://nebula-agent.xingyun3d.com/user/v1/ttsa_v2/session",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
