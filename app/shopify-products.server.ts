type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type ShopifyProductSummary = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  tags: string[];
  description?: string;
};

const PRODUCTS_QUERY = `#graphql
  query ReplyPulseProducts($first: Int!) {
    products(first: $first, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          productType
          tags
        }
      }
    }
  }
`;

const PRODUCT_BY_ID_QUERY = `#graphql
  query ReplyPulseProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      description
      productType
      tags
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ReplyPulseProductByHandle($query: String!) {
    products(first: 1, query: $query) {
      edges {
        node {
          id
          title
          handle
          description
          productType
          tags
        }
      }
    }
  }
`;

const PRODUCT_BY_TITLE_QUERY = `#graphql
  query ReplyPulseProductByTitle($query: String!) {
    products(first: 1, query: $query) {
      edges {
        node {
          id
          title
          handle
          description
          productType
          tags
        }
      }
    }
  }
`;

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTags(value: unknown) {
  return Array.isArray(value)
    ? value.map((tag) => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean)
    : [];
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

function queryStringLiteral(value: string) {
  return value.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCodePoint(Number.parseInt(code, 10));
      } catch {
        return " ";
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      try {
        return String.fromCodePoint(Number.parseInt(code, 16));
      } catch {
        return " ";
      }
    });
}

function cleanProductDescription(value: unknown) {
  return decodeHtmlEntities(readString(value))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, " ")
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|td|th)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1600);
}

function productFromNode(nodeValue: unknown): ShopifyProductSummary | null {
  const node = readObject(nodeValue);
  const title = readString(node.title);
  if (!title) return null;

  return {
    id: readString(node.id),
    title,
    handle: readString(node.handle),
    productType: readString(node.productType),
    tags: readTags(node.tags),
    description: cleanProductDescription(node.description),
  };
}

export async function loadShopifyProducts(
  admin?: AdminGraphql | null,
  first = 100,
): Promise<ShopifyProductSummary[]> {
  if (!admin) return [];

  const response = await admin.graphql(PRODUCTS_QUERY, {
    variables: { first: Math.max(1, Math.min(first, 100)) },
  });
  const body = (await response.json()) as unknown;
  const errors = readObject(body).errors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error(`Shopify products query failed: ${JSON.stringify(errors).slice(0, 1200)}`);
  }

  const products = readObject(readObject(body).data).products;
  const edges = readObject(products).edges;
  if (!Array.isArray(edges)) return [];

  const summaries: ShopifyProductSummary[] = [];
  for (const edge of edges) {
    const product = productFromNode(readObject(edge).node);
    if (product) summaries.push({...product, description: undefined});
  }

  return summaries;
}

export async function loadShopifyProductById(
  admin: AdminGraphql,
  id: string,
): Promise<ShopifyProductSummary | null> {
  if (!id.trim()) return null;

  const response = await admin.graphql(PRODUCT_BY_ID_QUERY, {
    variables: { id },
  });
  const body = (await response.json()) as unknown;
  const errors = readObject(body).errors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error(`Shopify product query failed: ${JSON.stringify(errors).slice(0, 1200)}`);
  }

  return productFromNode(readObject(readObject(readObject(body).data).product));
}

export async function loadShopifyProductByHandle(
  admin: AdminGraphql,
  handle: string,
): Promise<ShopifyProductSummary | null> {
  const cleanHandle = handle.trim();
  if (!cleanHandle) return null;

  const response = await admin.graphql(PRODUCT_BY_HANDLE_QUERY, {
    variables: { query: `handle:"${queryStringLiteral(cleanHandle)}"` },
  });
  const body = (await response.json()) as unknown;
  const errors = readObject(body).errors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error(`Shopify product query failed: ${JSON.stringify(errors).slice(0, 1200)}`);
  }

  const edges = readObject(readObject(readObject(body).data).products).edges;
  if (!Array.isArray(edges) || !edges[0]) return null;

  return productFromNode(readObject(edges[0]).node);
}

export async function loadShopifyProductByTitle(
  admin: AdminGraphql,
  title: string,
): Promise<ShopifyProductSummary | null> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  const response = await admin.graphql(PRODUCT_BY_TITLE_QUERY, {
    variables: { query: `title:"${queryStringLiteral(cleanTitle)}"` },
  });
  const body = (await response.json()) as unknown;
  const errors = readObject(body).errors;
  if (Array.isArray(errors) && errors.length) {
    throw new Error(`Shopify product query failed: ${JSON.stringify(errors).slice(0, 1200)}`);
  }

  const edges = readObject(readObject(readObject(body).data).products).edges;
  if (!Array.isArray(edges) || !edges[0]) return null;

  return productFromNode(readObject(edges[0]).node);
}

export function findProductByTitle(
  products: ShopifyProductSummary[],
  productTitle?: string | null,
) {
  const title = normalizeTitle(productTitle || "");
  if (!title) return null;

  return (
    products.find((product) => normalizeTitle(product.title) === title) ||
    products.find((product) => {
      const candidate = normalizeTitle(product.title);
      return candidate.includes(title) || title.includes(candidate);
    }) ||
    null
  );
}
