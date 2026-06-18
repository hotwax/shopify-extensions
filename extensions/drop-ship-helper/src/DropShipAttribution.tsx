import { render } from 'preact';
import { useState } from 'preact/hooks';

interface DropShipAttributionProps {
  api?: any;
}

/**
 * Select Fulfillment Method screen.
 * Displays the product details of the line item being attributed,
 * and allows selecting between "Fulfill from Another Store" and
 * "Fulfill from Warehouse".
 */
const DropShipAttribution = ({ api }: DropShipAttributionProps) => {
  // Use passed api object or fallback to global shopify object
  const activeApi = api || (typeof shopify !== 'undefined' ? shopify : null);
  const lineItem = activeApi?.cartLineItem;

  const quantity = lineItem?.quantity;
  const existingTransferOrderId = lineItem?.properties?.hc_transfer_order_id;

  // Screen routing state
  const [currentScreen, setCurrentScreen] = useState<'select' | 'input'>('select');
  // Input state for Transfer Order ID
  const [transferOrderId, setTransferOrderId] = useState(existingTransferOrderId || '');

  // Helper to programmatically close the modal
  const dismissModal = () => {
    // @ts-ignore
    if (typeof window !== 'undefined' && typeof window.close === 'function') {
      // @ts-ignore
      window.close();
    } else {
      // @ts-ignore
      close();
    }
  };

  const onFulfillFromAnotherStore = () => {
    setCurrentScreen('input');
  };

  const onFulfillFromWarehouse = () => {
    console.log("Selected: Fulfill from Warehouse");
    // @ts-ignore
    if (typeof shopify !== 'undefined' && shopify.toast) {
      // @ts-ignore
      shopify.toast.show("Selected: Fulfill from Warehouse");
    }
  };

  const onCancel = () => {
    dismissModal();
  };

  const onCompleteAssignment = async () => {
    if (lineItem?.uuid) {
      try {
        if (activeApi?.cart?.addLineItemProperties) {
          await activeApi.cart.addLineItemProperties(lineItem.uuid, {
            hc_transfer_order_id: transferOrderId
          });
        } else {
          console.warn("addLineItemProperties method not available on activeApi.cart");
        }
      } catch (error) {
        console.error("Failed to add line item property:", error);
      }
    } else {
      console.warn("No active lineItem or lineItem.uuid found to apply properties");
    }

    // @ts-ignore
    if (typeof shopify !== 'undefined' && shopify.toast) {
      // @ts-ignore
      shopify.toast.show(`Assigned Transfer Order ID: ${transferOrderId}`);
    }
    dismissModal();
  };

  const onRemoveAttribution = async () => {
    if (lineItem?.uuid) {
      try {
        if (activeApi?.cart?.removeLineItemProperties) {
          await activeApi.cart.removeLineItemProperties(lineItem.uuid, ['hc_transfer_order_id']);
        } else {
          console.warn("removeLineItemProperties method not available on activeApi.cart");
        }
      } catch (error) {
        console.error("Failed to remove line item property:", error);
      }
    }

    // @ts-ignore
    if (typeof shopify !== 'undefined' && shopify.toast) {
      // @ts-ignore
      shopify.toast.show("Attribution cleared");
    }
    dismissModal();
  };

  return (
    // @ts-ignore
    <s-navigator>
      {currentScreen === 'select' ? (
        // @ts-ignore
        <s-screen name="SelectFulfillmentMethod" title="Select Fulfillment Method">
          {/* @ts-ignore */}
          <s-scroll-view blockSize="100%">
            {/* @ts-ignore */}
            <s-stack direction="vertical" gap="large-100" alignItems="center" justifyContent="center" blockSize="75%">
              {/* @ts-ignore */}
              <s-box inlineSize="50%">
                {/* @ts-ignore */}
                <s-stack direction="vertical" gap="large-100">
                  {existingTransferOrderId && (
                    /* @ts-ignore */
                    <s-stack direction="vertical" spacing="1" alignItems="center">
                      {/* @ts-ignore */}
                      <s-text tone="subdued">
                        Current Transfer Order ID: {/* @ts-ignore */}
                        <s-text emphasis>{existingTransferOrderId}</s-text>
                      {/* @ts-ignore */}
                      </s-text>
                    {/* @ts-ignore */}
                    </s-stack>
                  )}

                  {/* @ts-ignore */}
                  <s-button onClick={onFulfillFromAnotherStore} variant="primary" style={{ inlineSize: '100%' }}>
                    {existingTransferOrderId ? "Edit Transfer Order ID" : "Fulfill from Another Store"}
                  {/* @ts-ignore */}
                  </s-button>
                   
                  {existingTransferOrderId && (
                    /* @ts-ignore */
                    <s-button onClick={onRemoveAttribution} tone="critical" style={{ inlineSize: '100%' }}>
                      Clear Attribution
                    {/* @ts-ignore */}
                    </s-button>
                  )}
                {/* @ts-ignore */}
                </s-stack>
              {/* @ts-ignore */}
              </s-box>
            {/* @ts-ignore */}
            </s-stack>
          {/* @ts-ignore */}
          </s-scroll-view>
        {/* @ts-ignore */}
        </s-screen>
      ) : (
        // @ts-ignore
        <s-screen name="TransferOrderId" title="Transfer Order ID">
          {/* @ts-ignore */}
          <s-scroll-view blockSize="100%">
            {/* @ts-ignore */}
            <s-stack direction="vertical" gap="large-100" alignItems="center" justifyContent="center" blockSize="75%">
              {/* @ts-ignore */}
              <s-box inlineSize="50%">
                {/* @ts-ignore */}
                <s-stack direction="vertical" gap="large-100">

                  {/* @ts-ignore */}
                  <s-stack direction="vertical" spacing="1" alignItems="left">
                    {/* @ts-ignore */}
                    <s-text tone="subdued" type="strong" >
                      Type: {/* @ts-ignore */}
                      <s-text emphasis>Drop Ship</s-text>
                    {/* @ts-ignore */}
                    </s-text>
                    {/* @ts-ignore */}
                    <s-text tone="subdued">
                      {`${quantity} ${quantity === 1 ? 'item' : 'items'} selected`}
                    {/* @ts-ignore */}
                    </s-text>
                  {/* @ts-ignore */}
                  </s-stack>

                  {/* @ts-ignore */}
                  <s-text-field
                    label="Enter Transfer Order ID"
                    placeholder="e.g., TO202605"
                    value={transferOrderId}
                    onInput={(e: any) => setTransferOrderId(e.target.value)}
                    details="This ID will be used to track the linked transfer order"
                  />

                  {/* @ts-ignore */}
                  <s-stack direction="inline" gap="base" justifyContent="center">
                    {/* @ts-ignore */}
                    <s-button onClick={onCancel}>
                      Cancel
                    {/* @ts-ignore */}
                    </s-button>
                    {/* @ts-ignore */}
                    <s-button variant="primary" onClick={onCompleteAssignment} disabled={!transferOrderId.trim()}>
                      Complete Assignment
                    {/* @ts-ignore */}
                    </s-button>
                  {/* @ts-ignore */}
                  </s-stack>

                {/* @ts-ignore */}
                </s-stack>
              {/* @ts-ignore */}
              </s-box>
            {/* @ts-ignore */}
            </s-stack>
          {/* @ts-ignore */}
          </s-scroll-view>
        {/* @ts-ignore */}
        </s-screen>
      )}
    {/* @ts-ignore */}
    </s-navigator>
  );
};

export default async (api: any) => {
  render(<DropShipAttribution api={api} />, document.body);
};
