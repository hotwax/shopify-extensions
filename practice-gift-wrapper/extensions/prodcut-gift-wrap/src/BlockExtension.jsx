
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
} from '@shopify/ui-extensions-react/admin';
import { Heading, Section } from '@shopify/ui-extensions/admin';
import Head from 'next/head';
import { useEffect, useState } from 'react';

const TARGET = 'admin.draft-order-details.block.render';

export default reactExtension(TARGET, () => <App />);



function App() {
  // const { query, data } = useApi(TARGET);
  const {data, query} = useApi(TARGET);
  const [items, setItems] = useState([]);
  // const [selectedItemIds, setSelectedItemIds] = useState(items.filter(item => item.selected).map(item => item.id));
  const [selectedItemIds, setSelectedItemIds] = useState(['none']);
  const [loading, setLoading] = useState(true);
  const [wrapTogether, setWrapTogether] = useState('together');
  const [giftNote, setGiftNote] = useState("");


  const draftOrderId = data?.selected[0]?.id;
  // Fetch Draft Order items dynamically
  useEffect(() => {
    fetchDraftOrderItems();
  }, [data]);

  async function fetchDraftOrderItems() {
    if (draftOrderId) {
      const QUERY = `
        query getDraftOrderItems($draftOrderId: ID!) {
          draftOrder(id: $draftOrderId) {
            id
            customAttributes {
              key
              value
            }
            note2
            lineItems(first: 10) {
              edges {
                node {
                  id
                  name
                  title
                  quantity
                  variant{
                    id
                  }
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      `;

      try {
        console.log('API calling started')
        const response = await query(QUERY, {variables: { draftOrderId: draftOrderId}  });

        console.log('RESTPONSE' , response?.data);
        console.log('API calling finsih')

        const draftOrder = response?.data?.draftOrder;

        if (draftOrder) {
          setGiftNote(draftOrder.note2 || "");
          setWrapTogether(draftOrder.customAttributes?.find(attr => attr.key === "giftWrappingOption")?.value || "together");

          const lineItems = draftOrder.lineItems.edges.map(({ node }) => {
            const giftWrapAttr = node.customAttributes?.find(attr => attr.key === "giftWrapOption");
            return {
              id: node.id,
              name: node.name || node.title,
              selected: !!giftWrapAttr,
              variant: node.variant?.id,
              quantity: node.quantity,
              wrapOption: giftWrapAttr?.value || "holiday",
            };
          });


          setItems(lineItems);
          const selectedIds = lineItems.filter(item => item.selected).map(item => String(item.id)); // Already string from above

          console.log("Selected IDs after fetch:", selectedIds);
          setSelectedItemIds(() => [...selectedIds]); 
          console.log("Selected Items IDs after fetch:", selectedItemIds);
          // setSelectedItemIds(selectedIds);  
        }


      } catch (error) {
        console.error('Error fetching draft order items:', error);
      } finally {
        setLoading(false);
      }
    }
  }

async function updateDraftOrder(draftOrderId, lineItems, giftNote, giftWrapOption, action) {
  const MUTATION = `
    mutation updateDraftOrder($input: DraftOrderInput!, $ownerId: ID!) {
      draftOrderUpdate(input: $input, id: $ownerId) {
        draftOrder { id }
        userErrors { message field }
      }
    }
  `;

  const input = action === "add" 
    ? {
        // note: giftNote || "No gift note provided",
        note: giftNote || "",
        customAttributes: [{ key: "giftWrappingOption", value: giftWrapOption || "None" }],
        lineItems: lineItems.map(({ id,quantity, name,variant, wrapOption }) => ({
          uuid: id,
          quantity: quantity,
          variantId: variant.id,
          customAttributes: [{ key: "giftWrapOption", value: wrapOption || "None" }]
          // title: name,
        }))
      } 
    : {
        note: "", // Remove gift note
        customAttributes: [], // Remove draft order-level custom attributes
        lineItems: lineItems.map(({ id,quantity, name,variant }) => ({
          uuid: id,
          variantId: variant.id,
          // title: name,
          quantity: quantity,
          customAttributes: [] // Remove line-item-level custom attributes
        }))
      };

  // console.log(`${action === "add" ? "Adding" : "Removing"} Gift Wrap - Input:`, JSON.stringify(input, null, 2));

  try {
    const response = await query(MUTATION, { variables: { input, ownerId: draftOrderId } });
    // console.log("Mutation Response:", JSON.stringify(response, null, 2));

    // if (response.errors) {
    //   console.error("GraphQL Errors:", response.errors);
    // }
    // if (response.data?.draftOrderUpdate?.userErrors.length > 0) {
    //   console.error("User Errors:", response.data.draftOrderUpdate.userErrors);
    // }

    await fetchDraftOrderItems();

  } catch (error) {
    // console.error("Mutation Failed:", error);
  }
}

  const handleItemSelection = (selectedIds) => {
    setSelectedItemIds(selectedIds);
    setItems((prevItems) =>
      prevItems.map((item) => ({
        ...item,
        selected: selectedIds.includes(item.id),
      }))
    );
  };

  // Handle wrap selection change
  const handleWrapSelection = (id, option) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, wrapOption: option } : item
      )
    );
  };

  async function handleAddGiftWrap() {
    // console.log("Updating Draft Order - Adding Gift Wrap...");
    const selectedItems = items.filter(item => item.selected);
    await updateDraftOrder(draftOrderId, selectedItems, giftNote, wrapTogether, "add");
  }
  
  // Handler to remove gift wrap data
  async function handleRemoveGiftWrap() {
    // console.log("Updating Draft Order - Removing Gift Wrap...");
    await updateDraftOrder(draftOrderId, items, "", "", "remove");

    await fetchDraftOrderItems();
  }

  return (
    <AdminBlock title="Gift wrap">
      <BlockStack blockGap="base" padding="base" blockSize="50%">
        <Heading size="4" >Select items to wrap</Heading>

        <ChoiceList
          choices={
            items.map((item) => ({
              label: item.name,  // Display product name as label
              id: item.id.toString()       // Use item ID for choice ID
            }))}
          multiple='true'
          defaultValue={selectedItemIds}
          value={selectedItemIds}
          onChange={handleItemSelection}
          />

        {/* Gift wrap together selection */}
        <Select
          label="Gift wrap together?"
          options={[
            { value: 'together', label: 'Together' },
            { value: 'separate', label: 'Separate' },
          ]}
          
          value={wrapTogether}
          onChange={setWrapTogether}
        />

        {wrapTogether === 'together' ? (
          <Select
            label="Select gift wrap"
            options={[
              { value: 'holiday', label: 'Holiday' },
              { value: 'withlove', label: 'With Love' }
            ]}
            value="holiday"
          />
        ) : (
          <BlockStack>
            <Heading size="4">Select gift wrap</Heading>
            {items.map(
            (item) =>
              item.selected && (
                <BlockStack key={item.id} padding="base none">
                  {/* <Text fontWeight="bold">{item.name}</Text> */}
                  <Select
                    // label="Select gift wrap"
                    label={item.name}
                    options={[
                      { value: 'holiday', label: 'Holiday' },
                      { value: 'withlove', label: 'With Love' }
                    ]}
                    value={item.wrapOption}
                    onChange={(value) => handleWrapSelection(item.id, value)}
                  />
                </BlockStack>
              )
          )}
          </BlockStack>
        )}

        <TextArea label="Gift Note" placeholder="Add an optional gift note" value={giftNote}
          onChange={setGiftNote} rows="5"/>

        <Text fontStyle="italic">Gift notes are printed in cursive font and applied to the gift wrapping.</Text>

        <InlineStack spacing="tight" columnGap="base" inlineAlignment="end">
          <Button variant="secondary" onPress={handleRemoveGiftWrap}>Remove Gift Wrap</Button>
          <Button variant="primary" 
          onPress={handleAddGiftWrap}
          >Confirm Gift Wrapping</Button>
        </InlineStack>
      </BlockStack>
    </AdminBlock>
  );
}