import { idToGid } from "../utils/gid";

export interface FAQ {
  question: string;
  answer: string;
  show_on_faq_page: boolean;
}

export type FAQSummary = FAQ & { id: string };

export const EMPTY_FAQ: FAQ = {
  question: "",
  answer: "",
  show_on_faq_page: true,
};

const primedFAQs = new Map<string, FAQ>();

export function primeFAQ(id: string, faq: FAQ) {
  primedFAQs.set(id, { ...faq });
}

export function getPrimedFAQ(id: string): FAQ | null {
  const faq = primedFAQs.get(id);
  return faq ? { ...faq } : null;
}

function gqlFetch(query: string, variables?: Record<string, unknown>) {
  return fetch("shopify:admin/api/2026-04/graphql.json", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  }).then((r) => r.json());
}

function parseFields(fields: Array<{ key: string; value: string }>): FAQ {
  const valueOf = (key: string) => fields.find((f) => f.key === key)?.value;
  return {
    question: valueOf("question") ?? "",
    answer: valueOf("answer") ?? "",
    show_on_faq_page: valueOf("show_on_faq_page") !== "false",
  };
}

function toFieldsPayload(faq: FAQ) {
  return [
    { key: "question", value: faq.question },
    { key: "answer", value: faq.answer },
    { key: "show_on_faq_page", value: String(faq.show_on_faq_page) },
  ];
}

export async function fetchFAQ(id: string): Promise<FAQ> {
  const json = await gqlFetch(
    `#graphql
    query FAQ($id: ID!) {
      metaobject(id: $id) {
        fields { key value }
      }
    }`,
    { id: idToGid(id) },
  );

  const faq = parseFields(json.data.metaobject.fields);
  primeFAQ(id, faq);
  return faq;
}

export async function listFAQs(): Promise<FAQSummary[]> {
  const json = await gqlFetch(
    `#graphql
    query FAQs {
      metaobjects(type: "$app:faq", first: 50, sortKey: "updated_at", reverse: true) {
        edges {
          node {
            id
            fields { key value }
          }
        }
      }
    }`,
  );

  return json.data.metaobjects.edges.map(
    ({
      node,
    }: {
      node: { id: string; fields: Array<{ key: string; value: string }> };
    }) => ({
      id: node.id,
      ...parseFields(node.fields),
    }),
  );
}

export async function createFAQ(faq: FAQ): Promise<string> {
  const json = await gqlFetch(
    `#graphql
    mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
      }
    }`,
    {
      metaobject: {
        type: "$app:faq",
        fields: toFieldsPayload(faq),
      },
    },
  );
  return json.data.metaobjectCreate.metaobject.id;
}

export async function updateFAQ(
  id: string,
  faq: FAQ,
): Promise<void> {
  await gqlFetch(
    `#graphql
    mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
      }
    }`,
    {
      id: idToGid(id),
      metaobject: { fields: toFieldsPayload(faq) },
    },
  );
  primeFAQ(id, faq);
}

export async function deleteFAQ(id: string): Promise<void> {
  await gqlFetch(
    `#graphql
    mutation DeleteMetaobject($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
      }
    }`,
    { id: idToGid(id) },
  );
}
