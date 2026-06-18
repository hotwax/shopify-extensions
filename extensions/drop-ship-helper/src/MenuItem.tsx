import { render } from 'preact';

/**
 * Menu item that appears in the cart line-item details action menu.
 * When tapped, it opens the Drop Ship Attribution modal (the companion
 * `pos.cart.line-item-details.action.render` target).
 */
const MenuItem = () => {
  const onPress = async () => {
    // @ts-ignore
    if (typeof shopify !== 'undefined' && shopify.action) {
      // @ts-ignore
      await shopify.action.presentModal();
    }
  };

  return (
    // @ts-ignore
    <s-button onClick={onPress}>
      Drop Ship Attribution
    {/* @ts-ignore */}
    </s-button>
  );
};

export default async () => {
  render(<MenuItem />, document.body);
};
