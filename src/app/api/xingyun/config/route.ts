import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 魔珐星云具身智能体凭证下发。
 *
 * SDK 按官方文档要求需要在浏览器侧携带 App ID / App Secret 建立会话，
 * 因此这里仅做同源、不缓存的运行时下发：密钥本体保存在 .env（服务端读取），
 * 不写入任何 NEXT_PUBLIC_ 变量，也不会出现在前端构建产物中。
 *
 * `?profile=xiaomei` 返回「小美」独立驱动应用凭证，缺省返回「诗仙」凭证（保持既有行为）。
 */
export async function GET(req: NextRequest) {
  const isXiaomei = req.nextUrl.searchParams.get("profile") === "xiaomei";

  const appId = isXiaomei ? process.env.XINGYUN_XIAOMEI_APP_ID : process.env.XINGYUN_APP_ID;
  const appSecret = isXiaomei ? process.env.XINGYUN_XIAOMEI_APP_SECRET : process.env.XINGYUN_APP_SECRET;
  const gatewayServer =
    (isXiaomei ? process.env.XINGYUN_XIAOMEI_GATEWAY_SERVER : process.env.XINGYUN_GATEWAY_SERVER) ||
    "https://nebula-agent.xingyun3d.com/user/v1/ttsa_v2/session";

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: isXiaomei ? "小美密钥未配置" : "魔珐星云密钥未配置" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { appId, appSecret, gatewayServer },
    { headers: { "Cache-Control": "no-store" } },
  );
}
