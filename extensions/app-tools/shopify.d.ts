import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/index.js' {
  interface ListFaqsInput {
    [k: string]: unknown;
  }

  interface ListFaqsOutput {
    results?: {
      /**
       * Always 'resource_link'
       */
      type: string;
      /**
       * GID URI of the FAQ metaobject
       */
      uri: string;
      /**
       * The FAQ question
       */
      name: string;
      /**
       * MIME type for this resource
       */
      mimeType: string;
      /**
       * Additional metadata for the FAQ entry
       */
      _meta?: {
        /**
         * The FAQ answer
         */
        answer?: string;
        /**
         * Whether this FAQ is publicly visible
         */
        show_on_faq_page?: boolean;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  }

  interface GetFaqInput {
    /**
     * The GID of the FAQ metaobject
     */
    id: string;
    [k: string]: unknown;
  }

  interface GetFaqOutput {
    results?: {
      /**
       * Always 'resource_link'
       */
      type: string;
      /**
       * GID URI of the FAQ metaobject
       */
      uri: string;
      /**
       * The FAQ question
       */
      name: string;
      /**
       * MIME type for this resource
       */
      mimeType: string;
      /**
       * Additional metadata for the FAQ entry
       */
      _meta?: {
        /**
         * The FAQ answer
         */
        answer?: string;
        /**
         * Whether this FAQ is publicly visible
         */
        show_on_faq_page?: boolean;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  }

  interface ShopifyTools {
    /**
     * List all FAQ entries
     */
    register(
      name: 'list_faqs',
      handler: (
        input: ListFaqsInput,
      ) => ListFaqsOutput | Promise<ListFaqsOutput>,
    ): () => void;
    /**
     * Get a single FAQ entry by ID
     */
    register(
      name: 'get_faq',
      handler: (input: GetFaqInput) => GetFaqOutput | Promise<GetFaqOutput>,
    ): () => void;
  }

  const shopify: import('@shopify/ui-extensions/admin').WithGeneratedTools<
    import('@shopify/ui-extensions/admin.app.tools.data').Api,
    ShopifyTools
  >;
  const globalThis: { shopify: typeof shopify };
}
