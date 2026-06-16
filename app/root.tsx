import "@shopify/polaris/build/esm/styles.css";
import "../src/styles.css";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "react-router";

export const loader = () => ({
  apiKey: process.env.SHOPIFY_API_KEY || "",
});

export const meta = () => [
  { title: "Reply Pulse AI: Review Replies" },
  {
    name: "description",
    content: "ReplyPulse helps Shopify merchants draft and manage product review replies.",
  },
];

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {apiKey ? <meta name="shopify-api-key" content={apiKey} /> : null}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
