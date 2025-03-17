async function getDraftOrderItems(orderId) {

  let hasNextPage = true;
  let cursor = null;
  let allLineItems = [];
  let getOrderResponse = null;

  try {
    while (hasNextPage) {
      const response = await fetch('shopify:admin/api/graphql.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetDraftOrder($id: ID!, $cursor: String) {
              draftOrder(id: $id) {
                note2
                customAttributes{
                  key
                  value
                }
                lineItems(first: 30, after: $cursor) { 
                  edges {
                    node {
                      variant {
                        id
                      }
                      product {
                        id
                        title                    
                      }
                      id
                      name
                      sku
                      quantity
                      custom                  
                      requiresShipping
                      taxable
                      grams
                      appliedDiscount {
                        title
                        value
                        valueType
                        amount
                        description
                      }                  
                      customAttributes {
                        key
                        value
                      }
                    }
                    cursor
                  }
                  pageInfo {
                    hasNextPage
                  }
                }
              }
            }
          `,
          variables: cursor ? { id: orderId, cursor } : { id: orderId },
        }),
      });

      getOrderResponse = await response.json();
      const lineItems = getOrderResponse?.data?.draftOrder?.lineItems?.edges || [];

      // Store fetched line items
      allLineItems.push(...lineItems.map(edge => edge));

      // Check if there's another page
      hasNextPage = getOrderResponse?.data?.draftOrder?.lineItems?.pageInfo?.hasNextPage;
      cursor = lineItems.length > 0 ? lineItems[lineItems.length - 1].cursor : null;
    }

    return {
      data: {
        draftOrder: {
          note: getOrderResponse?.data?.draftOrder?.note2 || "",
          customAttributes: getOrderResponse?.data?.draftOrder?.customAttributes || [],
          lineItems: {
            edges: allLineItems
          }
        }
      }
    }
  } catch (error) {
    console.error("Error getting draft order items:", error);
    return error;
  }
}

async function updateDraftOrder(shopifyOrderId, updateAttributes, draftOrderAttributes = {}) {
  try {
    // Step 1: Fetch the existing draft order
    const draftOrder = await getDraftOrderItems(shopifyOrderId);
    if (!draftOrder) {
      console.error("Failed to fetch draft order. Aborting update.");
      return null;
    }

    let updatedDraftOrderAttributes = draftOrder.data.draftOrder.customAttributes || [];
    if (draftOrderAttributes?.customAttributes) {
      updatedDraftOrderAttributes = [
        ...updatedDraftOrderAttributes.filter(
          (attr) => !draftOrderAttributes.customAttributes.some((updateAttr) => updateAttr.key === attr.key)
        ),
        ...draftOrderAttributes.customAttributes, // Add new/updated attributes
      ];
    }

    const updatedNote = draftOrderAttributes?.note !== undefined ? draftOrderAttributes.note : draftOrder.data.draftOrder.note;

    const updateOrderLineItems = draftOrder.data.draftOrder.lineItems.edges.map((item) => {
      const updatedLineItem = updateAttributes.find(
        (updateItem) => updateItem.variantId === item.node.variant.id
      );

      return {
        variantId: item.node.variant.id,
        quantity: item.node.quantity,
        requiresShipping: item.node.requiresShipping,
        taxable: item.node.taxable,
        grams: item.node.grams,
        appliedDiscount: item.node.appliedDiscount
          ? {
            title: item.node.appliedDiscount.title,
            value: item.node.appliedDiscount.value,
            valueType: item.node.appliedDiscount.valueType,
            amount: item.node.appliedDiscount.amount,
            description: item.node.appliedDiscount.description,
          }
          : null,
        customAttributes: updatedLineItem
          ? [...(item.node.customAttributes || []), ...updatedLineItem.customAttributes]
          : item.node.customAttributes || [],
      };
    });

    // Step 3: Send GraphQL Mutation
    const response = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Include Shopify authentication headers if needed
      },
      body: JSON.stringify({
        query: `
          mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
            draftOrderUpdate(id: $id, input: $input) {
              draftOrder {
                id
                lineItems(first: 10) {
                  edges {
                    node {                      
                      variant {
                        id
                      }
                      quantity
                      customAttributes {
                        key
                        value
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          id: shopifyOrderId,
          input: {
            note: updatedNote, // Use new note or existing
            customAttributes: updatedDraftOrderAttributes, // Use new or existing
            lineItems: updateOrderLineItems, // Use processed line items
          },
        },
      }),
    });

    const result = await response.json();

    if (result.errors || result.data.draftOrderUpdate.userErrors.length > 0) {
      console.error("Error updating draft order:===", JSON.stringify(result.errors, null)) || JSON.stringify(result.data.draftOrderUpdate.userErrors);
      return null;
    } else {
      return result.data.draftOrderUpdate.draftOrder;
    }
  } catch (error) {
    console.error("Error updating draft order:", JSON.stringify(error));
    return null;
  }
}

async function removeCustomAtrribute(shopifyOrderId, updateAttributes, draftOrderAttributes = {}) {
  console.log("updateAttributes==", updateAttributes);
  
  try {
    // Step 1: Fetch the existing draft order
    const draftOrder = await getDraftOrderItems(shopifyOrderId);
    if (!draftOrder) {
      console.error("Failed to fetch draft order. Aborting update.");
      return null;
    }

    let updatedDraftOrderAttributes = draftOrder.data.draftOrder.customAttributes || [];
    if (draftOrderAttributes?.customAttributes) {
      updatedDraftOrderAttributes = updatedDraftOrderAttributes.filter(
        (attr) => !draftOrderAttributes.customAttributes.some((removeAttr) => removeAttr.key === attr.key)
      );
    }

    const updatedNote = draftOrderAttributes?.note !== undefined ? draftOrderAttributes.note : draftOrder.data.draftOrder.note;

    // Step 2: Format line items for GraphQL mutation
    const updateOrderLineItems = draftOrder.data.draftOrder.lineItems.edges.map((item) => {
      const updatedLineItem = updateAttributes.find(
        (updateItem) => updateItem.variantId === item.node.variant.id
      );

      let updatedCustomAttributes;

      if (updatedLineItem) {
        console.log("Item Node Custom Attributes: ", item.node.customAttributes);
          console.log("Remove Custom Attributes: ", updatedLineItem.customAttributes);
        // Remove attributes specified in updateAttributes from the existing customAttributes
        updatedCustomAttributes = (item.node.customAttributes || []).filter(
          (attr) => !updatedLineItem.customAttributes.some((removeAttr) => removeAttr.key === attr.key)
          
        );
        console.log("updatedCustomAttributes==", updatedCustomAttributes);
      } else {
        // If no update is needed, keep existing attributes
        updatedCustomAttributes = item.node.customAttributes || [];
        console.log("updatedCustomAttributes== else", updatedCustomAttributes);
        
      }
      console.log("updatedCustomAttributes== final", updatedCustomAttributes);
      

      return {
        variantId: item.node.variant.id,
        quantity: item.node.quantity,
        requiresShipping: item.node.requiresShipping,
        taxable: item.node.taxable,
        grams: item.node.grams,
        appliedDiscount: item.node.appliedDiscount
          ? {
            title: item.node.appliedDiscount.title,
            value: item.node.appliedDiscount.value,
            valueType: item.node.appliedDiscount.valueType,
            amount: item.node.appliedDiscount.amount,
            description: item.node.appliedDiscount.description,
          }
          : null,
        customAttributes: updatedCustomAttributes,
      };
    });

    // Step 3: Send GraphQL Mutation
    const response = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
            draftOrderUpdate(id: $id, input: $input) {
              draftOrder {
                id
                lineItems(first: 10) {
                  edges {
                    node {                      
                      variant {
                        id
                      }
                      quantity
                      customAttributes {
                        key
                        value
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          id: shopifyOrderId,
          input: {
            note: updatedNote,
            customAttributes: updatedDraftOrderAttributes, 
            lineItems: updateOrderLineItems, // Use processed line items
          },
        },
      }),
    });
    console.log("updateOrderLineItems== final", updateOrderLineItems);
    

    const result = await response.json();
    console.log("result==", result);
    
    if (result.errors || result.data.draftOrderUpdate.userErrors.length > 0) {
      console.error("Error updating draft order:===", JSON.stringify(result.errors, null)) || JSON.stringify(result.data.draftOrderUpdate.userErrors);
      return null;
    } else {
      console.log("Draft order updated successfully:", result.data.draftOrderUpdate.draftOrder);
      return result.data.draftOrderUpdate.draftOrder;
    }
  } catch (error) {
    console.error("Error updating draft order:", JSON.stringify(error));
    return null;
  }
}

export { getDraftOrderItems, updateDraftOrder, removeCustomAtrribute };