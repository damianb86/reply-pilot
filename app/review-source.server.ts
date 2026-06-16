import db from "./db.server";
import {
  disconnectJudgeMe,
  getJudgeMeConnectionView,
  refreshJudgeMeConnection,
  serializeJudgeMeError,
} from "./judgeme.server";
import {
  disconnectYotpo,
  getYotpoConnectionView,
  refreshYotpoConnection,
  serializeYotpoError,
  YotpoApiError,
} from "./yotpo.server";

type JudgeMeConnectionView = NonNullable<Awaited<ReturnType<typeof getJudgeMeConnectionView>>>;

function mapJudgeMeConnection(connection: JudgeMeConnectionView) {
  return {
    ...connection,
    provider: "judgeme" as const,
    providerName: "Judge.me",
    connectedIdentifier: connection.shopDomain,
    authMethodLabel: "Private API token",
    credentialLabel: "API token",
    credentialMask: connection.tokenMask,
  };
}

export async function getReviewSourceConnectionView(shop: string) {
  const [judgeMeConnection, yotpoConnection] = await Promise.all([
    getJudgeMeConnectionView(shop),
    getYotpoConnectionView(shop),
  ]);

  if (judgeMeConnection && yotpoConnection) {
    return new Date(yotpoConnection.updatedAt).getTime() >= new Date(judgeMeConnection.updatedAt).getTime()
      ? yotpoConnection
      : mapJudgeMeConnection(judgeMeConnection);
  }

  if (yotpoConnection) return yotpoConnection;
  if (judgeMeConnection) return mapJudgeMeConnection(judgeMeConnection);
  return null;
}

export async function refreshReviewSourceConnection(shop: string) {
  const connection = await getReviewSourceConnectionView(shop);
  if (!connection) {
    throw new Error("There is no review source connection saved for this shop.");
  }

  if (connection.provider === "yotpo") {
    await refreshYotpoConnection(shop);
  } else {
    await refreshJudgeMeConnection(shop);
  }

  return getReviewSourceConnectionView(shop);
}

export async function disconnectReviewSource(shop: string) {
  await Promise.all([
    disconnectJudgeMe(shop),
    disconnectYotpo(shop),
  ]);
}

export async function clearOtherReviewSources(shop: string, activeProvider: "judgeme" | "yotpo") {
  if (activeProvider === "judgeme") {
    await db.yotpoConnection.deleteMany({ where: { shop } });
  } else {
    await db.judgeMeConnection.deleteMany({ where: { shop } });
  }
}

export function serializeReviewSourceError(error: unknown, provider?: "judgeme" | "yotpo") {
  if (provider === "yotpo" || error instanceof YotpoApiError) return serializeYotpoError(error);
  return serializeJudgeMeError(error);
}
