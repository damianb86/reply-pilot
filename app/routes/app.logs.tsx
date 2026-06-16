import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import LogsPage from "../../src/pages/LogsPage";
import { loadSentPageData, refreshSentPageData } from "../sent.server";
import { serializeReviewSourceError } from "../review-source.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  return loadSentPageData(session.shop);
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "sync") {
    try {
      const data = await refreshSentPageData(session.shop, admin);
      return {
        ok: true,
        intent,
        message: "Sent replies refreshed.",
        ...data,
      };
    } catch (error) {
      const serialized = serializeReviewSourceError(error);
      return {
        ok: false,
        intent,
        message: serialized.message,
        error: serialized,
        ...(await loadSentPageData(session.shop)),
      };
    }
  }

  return {
    ok: false,
    intent,
    message: "Unknown Sent action.",
    ...(await loadSentPageData(session.shop)),
  };
}

export default function LogsRoute() {
  return <LogsPage />;
}
