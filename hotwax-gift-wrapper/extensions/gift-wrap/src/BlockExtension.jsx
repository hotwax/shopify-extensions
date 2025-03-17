import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  Select,
  Button,
  InlineStack,
  ChoiceList,
  TextArea,
} from "@shopify/ui-extensions-react/admin";
import { Banner, Heading } from "@shopify/ui-extensions/admin";
import { useEffect, useState } from "react";
import {
  getDraftOrderItems,
  updateDraftOrder,
  removeCustomAtrribute,
} from "../utils/shopifyUpdateHandler";

const TARGET = "admin.draft-order-details.block.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, query, navigation } = useApi(TARGET);
  const [items, setItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [giftWrapOption, setGiftWrapOption] = useState(
    "Gift Wrap Items Together"
  );
  const [giftWrapForWrappingTogether, setGiftWrapForWrappingTogether] =
    useState("With Love");
  const [giftNote, setGiftNote] = useState("");
  const [updateMessage, setUpdateMessage] = useState("");

  const giftWrapOptions = [
    { value: "Gift Wrap Items Together", label: "Together" },
    { value: "Gift Wrap Items Separately", label: "Separate" },
  ];

  const wrapperOptions = [
    { value: "Holiday", label: "Holiday" },
    { value: "With Love", label: "With Love" },
  ];

  const draftOrderId = data?.selected[0]?.id;

  useEffect(() => {
    fetchDraftOrderItems();
  }, [data]);

  async function fetchDraftOrderItems() {
    if (draftOrderId) {
      try {
        const response = await getDraftOrderItems(draftOrderId);
        const draftOrder = response?.data?.draftOrder;
        
        if (draftOrder) {
          setGiftNote(draftOrder.note || "");
          setGiftWrapOption(
            draftOrder.customAttributes?.find(
              (attr) => attr.key === "Gift Wrap Option"
            )?.value || "Gift Wrap Items Together"
          );

          if (giftWrapOption === "Gift Wrap Items Together") {
            const wrapValue =
              draftOrder.lineItems.edges
                .find(({ node }) =>
                  node.customAttributes?.some(
                    (attr) => attr.key === "Gift Wrap"
                  )
                )
                ?.node?.customAttributes?.find(
                  (attr) => attr.key === "Gift Wrap"
                )?.value || "With Love";

            setGiftWrapForWrappingTogether(wrapValue);
          }

          const lineItems = draftOrder.lineItems.edges.map(({ node }) => {
            const giftWrapAttr = node.customAttributes?.find(
              (attr) => attr.key === "Gift Wrap"
            );
            return {
              id: node.id,
              name: node.name || node.title,
              selected: !!giftWrapAttr,
              variantId: node.variant?.id,
              quantity: node.quantity,
              wrapOption: giftWrapAttr?.value || "With Love",
              customAttributes: node.customAttributes || [],
            };
          });

          const selectedIds = lineItems
            .filter((item) => item.selected)
            .map((item) => item.id.toString());

          setItems(lineItems);
          setSelectedItemIds(selectedIds);
        }
      } finally {
        setLoading(false);
      }
    }
  }


  async function updateOrder(
    giftWrapOption,
    action
  ) {
    try {
      const updateOrderAttribute = {
        note: action === "add" ? giftNote : null,
        customAttributes: [{ key: "Gift Wrap Option", value: giftWrapOption }],
      };

      const updateLineItemAttribute = items
        .filter((item) => item.selected) 
        .map(({ variantId, wrapOption }) => ({
          variantId, 
          customAttributes: [{key: "Gift Wrap", value :wrapOption}]
        }));

      await action === "add" ? updateDraftOrder(
        draftOrderId,
        updateLineItemAttribute,
        updateOrderAttribute
      ) : removeCustomAtrribute(
        draftOrderId,
        updateLineItemAttribute,
        updateOrderAttribute
      );

      await fetchDraftOrderItems();
    } catch (error) {
      setUpdateMessage("Draft Order couldn't be updated. Please try again.");
    } finally {
      setUpdateMessage(
        "Draft Order updated successfully. Please refresh to view"
      );
    }
  }

  const itemSelection = (selectedIds) => {
    setSelectedItemIds(selectedIds);

    if (selectedIds.length === 1) {
      setGiftWrapOption("Gift Wrap Items Together");
    }

    setItems((prevItems) =>
      prevItems.map((item) => ({
        ...item,
        selected: selectedIds.includes(item.id),
        wrapOption:
          selectedIds.includes(item.id) &&
          giftWrapOption === "Gift Wrap Items Together"
            ? giftWrapForWrappingTogether
            : item.wrapOption,
      }))
    );
  };

  const giftWrapOptionChange = (value) => {
    setGiftWrapOption(value);
  
    if (value === "Gift Wrap Items Together") {
      setGiftWrapForWrappingTogether("With Love"); // Set default wrap when switching to Together
  
      setItems((prevItems) =>
        prevItems.map((item) => ({
          ...item,
          wrapOption: item.selected ? "With Love" : item.wrapOption, // ✅ Sync all selected items
        }))
      );
    }
  };
  const wrapSelection = (id, option) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, wrapOption: option } : item
      )
    );
  };

  const giftWrapForWrappingTogetherChange = (value) => {
    setGiftWrapForWrappingTogether(value);
    setItems((prevItems) =>
      prevItems.map((item) => ({
        ...item,
        wrapOption:
          item.selected && giftWrapOption === "Gift Wrap Items Together"
            ? value
            : item.wrapOption,
      }))
    );
  };

  async function addGiftWrap() {
    await updateOrder(
      giftWrapOption,
      "add"
    );
  }

  async function removeGiftWrap() {
    await updateOrder(
      "",
      "remove"
    );
    setSelectedItemIds([]);
  }

  return (
    <AdminBlock title="Gift wrap">
      <BlockStack blockGap="base" padding="base" blockSize="50%">
        <Heading size="4">Select items to wrap</Heading>
        <ChoiceList
          choices={items.map((item) => ({
            label: item.name,
            id: item.id.toString(),
          }))}
          multiple="true"
          value={selectedItemIds}
          onChange={itemSelection}
        />
        {selectedItemIds.length > 1 && (
          <InlineStack
            padding={"none none"}
            blockAlignment="center"
            inlineAlignment="space-between"
          >
            <BlockStack inlineSize={"40%"} blockAlignment="center">
              <Text fontWeight="normal">Gift wrap together?</Text>
            </BlockStack>

            <BlockStack>
              <Select
                options={giftWrapOptions}
                value={giftWrapOption}
                onChange={giftWrapOptionChange}
              />
            </BlockStack>
          </InlineStack>
        )}
        {giftWrapOption === "Gift Wrap Items Together" ? (
          <InlineStack blockAlignment="center" inlineAlignment="space-between">
            <BlockStack inlineSize={"40%"} blockAlignment="center">
              <Text fontWeight="normal">Select gift wrap</Text>
            </BlockStack>
            <BlockStack>
              <Select
                options={wrapperOptions}
                value={giftWrapForWrappingTogether}
                onChange={giftWrapForWrappingTogetherChange}
              />
            </BlockStack>
          </InlineStack>
        ) : (
          <BlockStack>
            <Heading size="4">Select gift wrap</Heading>
            {items.map(
              (item) =>
                item.selected && (
                  <InlineStack
                    key={item.id}
                    blockAlignment="center"
                    inlineAlignment="space-between"
                  >
                    <BlockStack blockAlignment="center">
                      <Text fontWeight="normal">{item.name}</Text>
                    </BlockStack>
                    <BlockStack inlineSize={"30%"}>
                      <Select
                        options={wrapperOptions}
                        value={item.wrapOption}
                        onChange={(value) => wrapSelection(item.id, value)}
                      />
                    </BlockStack>
                  </InlineStack>
                )
            )}
          </BlockStack>
        )}

        <TextArea
          label="Gift Note"
          placeholder="Add an optional gift note"
          value={giftNote}
          onChange={setGiftNote}
          rows="3"
        />
        <Text fontStyle="italic">
          Gift notes are printed in cursive font and applied to the gift
          wrapping.
        </Text>

        <InlineStack spacing="tight" columnGap="base" inlineAlignment="end">
          <Button variant="secondary" onPress={removeGiftWrap}>
            Remove Gift Wrap
          </Button>
          <Button
            variant="primary"
            onPress={addGiftWrap}
            disabled={selectedItemIds.length === 0}
          >
            Confirm Gift Wrapping
          </Button>
        </InlineStack>
        {updateMessage && <Banner tone="info">{updateMessage}</Banner>}
      </BlockStack>
    </AdminBlock>
  );
}
