import { listFAQs, fetchFAQ } from '../../../shared/models/faq';
import { gidToId } from '../../../shared/utils/gid';

/** @typedef {import('../../../shared/models/faq').FAQ} FAQ */

const MIME_TYPE = 'application/faq';

/**
 * @param {string} id
 * @param {FAQ} faq
 */
function toResourceLink(id, faq) {
  return {
    type: 'resource_link',
    uri: `gid://${MIME_TYPE}/${gidToId(id)}`,
    name: faq.question,
    mimeType: MIME_TYPE,
    _meta: {
      answer: faq.answer,
      show_on_faq_page: faq.show_on_faq_page,
    },
  };
}

export default () => {
  shopify.tools.register('list_faqs', async () => {
    const faqs = await listFAQs();
    return {
      results: faqs.map((faq) => toResourceLink(faq.id, faq)),
    };
  });

  shopify.tools.register(
    'get_faq',
    /** @param {{ id: string }} input */
    async ({ id }) => {
      const faq = await fetchFAQ(gidToId(id));
      return {
        results: [toResourceLink(id, faq)],
      };
    },
  );
};
