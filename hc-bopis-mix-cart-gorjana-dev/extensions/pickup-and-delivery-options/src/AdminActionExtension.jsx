import { useState, useEffect } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  Button,
  BlockStack,
  Select,
  Text,
  Banner,
  ProgressIndicator,
  TextField
} from "@shopify/ui-extensions-react/admin";
import { getDraftOrderItems, updateDraftOrder, removeCustomAtrribute } from "../utils/shopifyUpdateHandler";

const TARGET = "admin.draft-order-details.action.render";
const API_OMS_BASE_URL = "https://gorjana-uat.hotwax.io/api";
const API_MAARG_BASE_URL = "https://gorjana-maarg-uat.hotwax.io/rest/s1";

export default reactExtension(TARGET, () => <AdminActionApp />);

function AdminActionApp() {
  const { close, data, intents, navigation } = useApi(TARGET);
  const url = intents?.launchUrl;
  const params = url ? new URL(url).searchParams : null;

  const sku = params?.get("sku");
  const [zipCode, setZipCode] = useState("");
  console.log("Update Pickup location for single sku:", sku);
  // console.log("Admin Action zipCode:", zipCode);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [lineItems, setLineItems] = useState([]);
  const [currentSku, setCurrentSku] = useState(null);
  const [zipCodeError, setZipCodeError] = useState("");
  const [inventoryError, setInventoryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateError, setUpdateError] = useState("");

  useEffect(() => {
    fetchLineItems();
  }, [data]);

  const fetchLineItems = async () => {
    if (!data?.selected[0]?.id) return;
    const orderId = data.selected[0].id;
    const { lineItems } = await getOrderDetails(orderId);
    setLineItems(lineItems);
    const initialSelectedStore = lineItems.find(item => item.node.sku === sku)?.node.customAttributes.find(attr => attr.key === "_pickupstore")?.value || "";
    setSelectedStore(initialSelectedStore);
  };

  const fetchStores = async (sku) => {
    if (!zipCode) {
      setZipCodeError("Zip code is required.");
      return;
    }
    setLoading(true);
    setCurrentSku(sku);
    // console.log("Fetching stores for SKU:", sku);
    // sku = "216-009-G"
    const availableStores = await getAvailableStores(zipCode, [sku], lineItems);
    setStores(availableStores);
    setLoading(false);
    if (availableStores.length > 0) {
      setSelectedStore(availableStores[0].value);
    }
    if (availableStores.length === 0) {
      setInventoryError(`SKU ${sku} cannot be opted for Store Pickup as the inventory is not available.`);
    } else {
      setInventoryError("");
    }
    setStores(availableStores);
  };

  const handleSave = async () => {
    setUpdatingOrder(true);
    const updatedStores = { [sku]: selectedStore };
    await updateDraftOrderAttributes(data, lineItems, updatedStores, stores);
    setUpdateMessage("Order updated successfully! Please refresh the page to reflect the changes.");
    setUpdatingOrder(false);
  };

  return (
    <AdminAction
      title="Select Pickup Store for Product"
      primaryAction={<Button onPress={handleSave} variant="primary">Save</Button>}
      secondaryAction={<Button onPress={close} variant="secondary">Cancel</Button>}
    >
      <BlockStack rowGap="base" gap="base">
        {updateMessage && <Banner status="success">{updateMessage}</Banner>}
        {updateError && <Banner status="critical">{updateError}</Banner>}
        <Text>SKU: {sku}</Text>
        <TextField
          label="Enter Zip Code"
          value={zipCode}
          onChange={(value) => {
            setZipCode(value);
            setZipCodeError("");
          }}
          error={zipCodeError}
        />
        <Button onPress={fetchStores} disabled={loading}>
          {loading ? "Loading..." : "Find Stores"}
        </Button>
        {zipCodeError && <Banner status="critical">{zipCodeError}</Banner>}
        {inventoryError && <Banner status="critical">{inventoryError}</Banner>}        

        {stores.length > 0 && (
          <Select
            label="Choose Store"
            options={stores}
            value={selectedStore}
            onChange={(value) => setSelectedStore(value)}
          />
        )}
        {loading && <ProgressIndicator size="small-200" accessibilityLabel="Loading stores" />}
      </BlockStack>
    </AdminAction>
  );
}

async function getOrderDetails(orderId) {
  const result = await getDraftOrderItems(orderId);
  //  const result = await response.json();
  const lineItems = result?.data?.draftOrder?.lineItems?.edges || [];
  return { lineItems };
}

async function getAvailableStores(zipCode, sku, lineItems) {
  try {
    console.log("Fetching stores with available inventory for zip code:", zipCode, "and SKU:", sku);
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
    //console.log("Latitude:", latitude, "Longitude:", longitude);
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
    //  console.log(" ~~~~~~~~~~~~~~~~~~ ", storeResponse);
    const storeResult = await storeResponse.json();
    const stores = storeResult.response.docs.map(store => ({
      label: `${store.storeName} (${Math.floor((Math.round(store.dist * 100) / 100) * 0.621371)} miles)`,
      value: store.storeCode,
      distance: `${Math.floor((Math.round(store.dist * 100) / 100) * 0.621371)}`,
    }));
    // sku = "231-106-G"
    const inventoryResponse = await fetch(`${API_MAARG_BASE_URL}/ofbiz-oms-usl/checkBopisInventory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        productStoreId: "STORE",
        internalNames: sku,
        facilityIds: stores.map(store => store.value),
        inventoryGroupId: "FAC_GRP"
      }),
    });
    //  console.log("inventoryResponse ---->  ", inventoryResponse)
    const inventoryResult = await inventoryResponse.json();
    const inventoryByStore = inventoryResult.resultList.reduce((acc, item) => {
      if (!acc[item.facilityId]) {
        acc[item.facilityId] = {};
      }
      if (item.computedAtp > 0) {
        acc[item.facilityId][item.internalName] = item.computedAtp;
      }
      return acc;
    }, {});
    //console.log("inventoryByStore ---->  ", inventoryByStore);
    const availableStores = stores.filter(store => {
      const lineItem = lineItems.find(item => item.node.sku === sku);
      return inventoryByStore[store.value] && inventoryByStore[store.value][sku] >= (lineItem ? lineItem.node.quantity : 0);
    });

    return availableStores;
  } catch (error) {
    console.error("Error fetching stores with inventory:", error);
    return [];
  }
}
async function updateDraftOrderAttributes(data, lineItems, selectedStores, stores) {
  try {
    const updateLocationAttributes = lineItems.map((item) => {
      if (item.node.sku !== Object.keys(selectedStores)[0]) {
        return {
          variantId: item.node.variant.id,
          customAttributes: item.node.customAttributes
        };
      }

      const pickupStoreCode = selectedStores[item.node.sku];
      if (!pickupStoreCode) return null;

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
    }).filter(Boolean);

    const response = await updateDraftOrder(data.selected[0].id, updateLocationAttributes);
    if (!response) {
      console.error("Error updating draft order");
    } else {
      console.log("Draft order updated successfully");
    }


  } catch (error) {
    setUpdateError("Oops! Something went wrong. Please try updating the order again.");
  }
}