import React, { useState, useEffect } from "react";
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  TextField,
  InlineStack,
  ChoiceList,
  Select,
  Button,
  Banner,
  ProgressIndicator
} from "@shopify/ui-extensions-react/admin";

import { getDraftOrderItems, updateDraftOrder, removeCustomAtrribute } from "../utils/shopifyUpdateHandler";

const TARGET = "admin.draft-order-details.block.render";
const API_OMS_BASE_URL = "https://gorjana-uat.hotwax.io/api";
const API_MAARG_BASE_URL = "https://gorjana-maarg-uat.hotwax.io/rest/s1";

export default reactExtension(TARGET, () => <App />);

async function getOrderDetails(orderId) {
  const result = await getDraftOrderItems(orderId);
  const lineItems = result?.data?.draftOrder?.lineItems?.edges || [];
  const skus = lineItems.flatMap(edge => edge.node.sku).filter(sku => sku);
  console.log("SKUs: ", skus);
  return { lineItems, skus };
}

async function getAvailableStores(zipCode, skus, lineItems) {
  try {
    const postcodeResponse = await fetch(`${API_OMS_BASE_URL}/postcodeLookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        json: {
          query: `postcode:${zipCode}`
        }
      }),
    });

    const postcodeResult = await postcodeResponse.json();
    const { latitude, longitude } = postcodeResult.response.docs[0];
    //    console.log("================= "+latitude+" "+longitude);
    const storeResponse = await fetch(`${API_OMS_BASE_URL}/storeLookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        viewSize: 150,
        filters: ["storeType: RETAIL_STORE", "pickup_pref: true"],
        point: `${latitude},${longitude}`,
        //  distance: 50,
        sortBy: "storeName asc",
      }),
    });

    const storeResult = await storeResponse.json();
    //    console.log("Stores: ", storeResult.response.docs[0].dist);

    console.log("Store Result: ",storeResult.response.docs);
    const stores = storeResult.response.docs.map(store => ({
      label: `${store.storeName} (${Math.floor((Math.round(store.dist * 100) / 100) * 0.621371)} miles)`,
      value: store.storeCode,
      distance: `${Math.floor((Math.round(store.dist * 100) / 100) * 0.621371)}`
    }));

    //skus = ["216-009-G", "231-106-G", "EXT-3-G"]
    const inventoryResponse = await fetch(`${API_MAARG_BASE_URL}/ofbiz-oms-usl/checkBopisInventory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        productStoreId: "STORE",
        internalNames: skus,
        facilityIds: stores.map(store => store.value),
        inventoryGroupId: "FAC_GRP"
      }),
    });
    // console.log("SKUs: ", skus);
    const inventoryResult = await inventoryResponse.json();
    console.log("Inventory: ", inventoryResult.resultList);
    const inventoryByStore = inventoryResult.resultList.reduce((acc, item) => {
      if (!acc[item.facilityId]) {
        acc[item.facilityId] = {};
      }
      if (item.computedAtp > 0) {
        acc[item.facilityId][item.internalName] = item.computedAtp;
      }
      return acc;
    }, {});
    //  console.log("Inventory by store: ", inventoryByStore);
    const availableStores = stores.filter(store =>
      skus.every(sku => {
        const lineItem = lineItems.find(item => item.node.sku === sku);
        return inventoryByStore[store.value] && inventoryByStore[store.value][sku] >= (lineItem ? lineItem.node.quantity : 0);
      })
      //  skus.every(sku => inventoryByStore[store.value] && inventoryByStore[store.value][sku])
    );
    // console.log("Available Stores: ", availableStores);
    const sortedStores = availableStores.sort((a, b) => parseInt(a.distance, 10) - parseInt(b.distance, 10));
    return sortedStores;
  } catch (error) {
    console.error("Error fetching stores with inventory:", error);
    return [];
  }
}
async function updateDraftOrderAttributes(data, lineItems, selectedStores, stores) {
  try {

    const updateAttributes = lineItems.map((item) => {
      const pickupStoreCode = selectedStores[item.node.sku] || selectedStores["all"];
      if (!pickupStoreCode) {
        // Remove the custom attributes if no store is selected
        const customAttributes = item.node.customAttributes.filter(attr => !["_pickupstore", "_delivery_type", "Pick Up"].includes(attr.key));
        return {
          variantId: item.node.variant.id,
          customAttributes,
        };
      }

      const pickupStore = stores.find(store => store.value === pickupStoreCode);
      const pickupStoreName = pickupStore ? pickupStore.label.split(' (')[0] : '';

      return {
        variantId: item.node.variant.id,
        customAttributes: [
          //  ...item.node.customAttributes,
          { key: "_delivery_type", value: "pick_up_instore" },
          { key: "_pickupstore", value: pickupStoreCode },
          { key: "Pick Up", value: pickupStoreName },
        ],
      };
    });
    const response = await updateDraftOrder(data.selected[0].id, updateAttributes);
    //console.log(" ~~~~~~~~~~~~~~~~ "+response);
    if (response.errors) {
      console.error("Error updating draft order:", response.errors);
    } else {
      console.log("Draft order updated successfully");
    }
  } catch (error) {
    setUpdateError("Oops! Something went wrong. Please try updating the order again.");
  }
}

async function updateCustomAttributes(data, lineItems) {
  try {
    const removeAttributes = lineItems.map((item) => {
      const customAttributes = item.node.customAttributes.filter(attr => attr.key === "_pickupstore" || attr.key === "_delivery_type" || attr.key === "Pick Up");
      return {
        variantId: item.node.variant.id,
        customAttributes,
      };
    });
    const response = await removeCustomAtrribute(data.selected[0].id, removeAttributes);
    //    const result = await response.json();
    if (response.errors) {
      console.error("Error updating draft order:", response.errors);
    } else {
      console.log("Draft order updated successfully");
    }
  } catch (error) {
    setUpdateError("Oops! Something went wrong. Please try updating the order again.");
  }
}

function App() {
  const { data, navigation } = useApi(TARGET);
  const [zipCode, setZipCode] = useState("");
  const [stores, setStores] = useState([]);
  const [selectedStores, setSelectedStores] = useState({});
  const [deliveryType, setDeliveryType] = useState("ship");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [showNoStoresMessage, setShowNoStoresMessage] = useState(false);
  const [zipCodeError, setZipCodeError] = useState("");
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [orderMessage, setOrderMessage] = useState("");


  const fetchLineItems = async () => {
    if (!data?.selected[0]?.id) return;
    const { lineItems, skus } = await getOrderDetails(`${data.selected[0].id}`);
    const unfulfilledLineItems = lineItems.filter(item => item.node.fulfillment_status !== "fulfilled");
    setLineItems(unfulfilledLineItems);
    setProducts(skus);

    // Populate selectedStores with initial values
    const initialSelectedStores = {};
    unfulfilledLineItems.forEach(item => {
      const pickupStore = item.node.customAttributes.find(attr => attr.key === "_pickupstore")?.value;
      if (pickupStore) {
        initialSelectedStores[item.node.sku] = pickupStore;
      }
    });
    setSelectedStores(initialSelectedStores);
    updateOrderMessage(unfulfilledLineItems);
  };
  const updateOrderMessage = (lineItems) => {
    const pickupStores = lineItems.map(item => item.node.customAttributes.find(attr => attr.key === "Pick Up")?.value).filter(Boolean);
    const uniquePickupStores = [...new Set(pickupStores)];
    if (uniquePickupStores.length === 0) {
      setOrderMessage("Great news! Your order will be delivered directly to your address.");
    } else if (uniquePickupStores.length === 1) {
      if (pickupStores.length === lineItems.length) {
        setOrderMessage(`Heads up! Your order will be ready for pickup at the '${uniquePickupStores[0]}' store.`);
      } else {
        setOrderMessage(`Mixed delivery! Items with the "Pick Up" attribute will be ready for pickup at the '${uniquePickupStores[0]}' store, while the rest will be delivered to your address.`);
      }
    } else {     
      setOrderMessage(`Multiple pickups! Your items will be ready for pickup from the following stores: ${uniquePickupStores.join(", ")}.`);
    }
  };

  useEffect(() => {
    fetchLineItems();
  }, [data]);

  useEffect(() => {
    fetchLineItems();
  }, [deliveryType]);

  const handleDeliveryChange = async (value) => {
    const newDeliveryType = value;
    setDeliveryType(newDeliveryType);
    setSelectedStores({});
    setZipCode("");
    setStores([]);
    setShowNoStoresMessage(false);
    setZipCodeError("");
    setUpdateMessage("");
    setUpdateError("");
  };

  const fetchStores = async () => {
    if (!zipCode) {
      setZipCodeError("Zip code is required.");
      return;
    }
    if (zipCode.length < 5 || zipCode.length > 9) {
      setZipCodeError("Zip code length must lie between 5 and 9");
      return;
    }
    setLoading(true);
    try {
      await fetchLineItems(); // Fetch products before fetching stores
      const storeList = await getAvailableStores(zipCode, products, lineItems);
      setStores(storeList);
      if (storeList.length > 0) {
        setSelectedStores({ all: storeList[0].value });
      }
      setShowNoStoresMessage(storeList.length === 0);
    } catch (error) {
      console.error("Error fetching stores:", error);
    }
    setLoading(false);
  };

  const handleUpdateDraftOrder = async () => {
    setUpdatingOrder(true);
    setUpdateError("");
    try {
      if (deliveryType === "pickup_separate") {
        // Remove custom attributes for line items with no store selected
        const lineItemsWithoutStore = lineItems.filter(item => !selectedStores[item.node.sku]);
        await updateCustomAttributes(data, lineItemsWithoutStore);
        // Update draft order for line items with store selected
        // const lineItemsWithStore = lineItems.filter(item => selectedStores[item.node.sku]);
        // await updateDraftOrderAttributes(data, lineItemsWithStore, selectedStores, stores);
      } else {
        // Update draft order for "Store Pickup Together" and "Ship"
        await updateDraftOrderAttributes(data, lineItems, selectedStores, stores);
      }

      setUpdateMessage("Order updated successfully! Please refresh the page to reflect the changes.");
    } catch (error) {
      setUpdateError("Oops! Something went wrong. Please try updating the order again.");
    }
    setUpdatingOrder(false);
    fetchLineItems();
  }

  const handleUpdateCustomAttributes = async () => {
    setUpdatingOrder(true);
    setUpdateError("");
    try {
      await updateCustomAttributes(data, lineItems);
      setUpdateMessage("Order updated successfully! Please refresh the page to reflect the changes.");

    } catch (error) {
      setUpdateError("Oops! Something went wrong. Please try updating the order again.");
    }
    setUpdatingOrder(false);
    fetchLineItems();
  }

  const openStoreAdminAction = (sku) => {
    // if (!zipCode) {
    //   setZipCodeError("Zip code is required.");
    //   return;
    // }
    // if (zipCode.length < 5 || zipCode.length > 9) {
    //   setZipCodeError("Zip code length must lie between 5 and 9");
    //   return;
    // }
    //    const skusParam = products.join(",");
    navigation.navigate(`extension:store-pickup-separate-admin-action?&sku=${sku}`);
  };

  const handleRemoveStore = (sku) => {
    setSelectedStores((prevSelectedStores) => {
      const newSelectedStores = { ...prevSelectedStores };
      delete newSelectedStores[sku];
      return newSelectedStores;
    });
  };

  const isOrderFulfilled = data?.selected[0]?.fulfillment_status === "fulfilled";
  if (isOrderFulfilled) {
    setOrderMessage("Order has been fulfilled and cannot be updated.");
  }
  return (
    <AdminBlock title="Pickup and Delivery Options">
      <BlockStack rowGap="base" gap="base">
        {orderMessage && <Text fontWeight="bold">{"Note: "+orderMessage}</Text>}
        <ChoiceList
          name="delivery-option"
          choices={[
            { label: "Ship", id: "ship" },
            { label: "Store Pickup Together", id: "pickup_together" },
            { label: "Store Pickup Separate", id: "pickup_separate" }
          ]}
          value={deliveryType}
          onChange={handleDeliveryChange}
          disabled={isOrderFulfilled}
        />

        {deliveryType === "pickup_together" && (
          <>
            <TextField
              label="Enter Zip Code"
              value={zipCode}
              onChange={(value) => {
                setZipCode(value);
                setZipCodeError("");
                if (stores.length > 0) {
                  setStores([]);
                }
              }}
              placeholder="Find Pickup Stores"
              error={zipCodeError}
              block
            />
            {stores.length > 0 ? (
              <Select
                label="Select Store"
                options={stores}
                value={selectedStores["all"] || ""}
                onChange={(value) => setSelectedStores({ all: value })}
              />
            ) : (
              showNoStoresMessage && <Text>No store is available to fulfill all the items.</Text>
            )}
            <InlineStack gap="base" inlineAlignment="start" inlineGap="base">
            <Button onPress={fetchStores} disabled={loading}>
              {loading ? "Loading..." : "Search"}
            </Button>            
            <Button onPress={handleUpdateDraftOrder} disabled={!selectedStores["all"]} variant="primary">
              Save
            </Button>
            </InlineStack>          
          </>
        )}

        {deliveryType === "pickup_separate" && (
          <>
            {lineItems.map((item) => {
              const pickupStoreCode = selectedStores[item.node.sku];
              let pickupStoreName = "No store selected";
              if (pickupStoreCode) {
                pickupStoreName = item.node.customAttributes.find(attr => attr.key === "Pick Up")?.value;                
              }
              // const pickupStore = stores.find(store => store.value === pickupStoreCode);
              // const pickupStoreName = pickupStore ? pickupStore.label.split(' (')[0] : "No store selected";

              // const pickupStore = item.node.customAttributes.find(attr => attr.key === "Pick Up")?.value;
              // const pickupStoreName = pickupStore ? pickupStore : "No store selected";
              return (
                <InlineStack key={item.node.sku} gap="base" rowGap="small" inlineAlignment="space-between">
                  <Text>{item.node.sku}</Text>
                  <Text>{pickupStoreName}</Text>
                  {
                    selectedStores[item.node.sku] ? (
                      <Button onPress={() => handleRemoveStore(item.node.sku)} variant="secondary" tone="critical">
                        Remove Store
                      </Button>
                    ) : (
                      <Button onPress={() => openStoreAdminAction(item.node.sku)} variant="secondary">
                        Select Store
                      </Button>
                    )}
                </InlineStack>
              );
            })}
            <Button onPress={handleUpdateDraftOrder} variant="primary">
              Save
            </Button>
          </>
        )}

        {deliveryType === "ship" && (
          <Button onPress={handleUpdateCustomAttributes} variant="primary">
            Save
          </Button>
        )}

        {updatingOrder && <ProgressIndicator size="small-200" accessibilityLabel="Updating order" />}

        {updateMessage && <Banner tone="info"><Text fontWeight="bold">{updateMessage}</Text></Banner>}
        {updateError && <Banner tone="critical"><Text fontWeight="bold">{updateError}</Text></Banner>}        

      </BlockStack>
    </AdminBlock>
  );
}