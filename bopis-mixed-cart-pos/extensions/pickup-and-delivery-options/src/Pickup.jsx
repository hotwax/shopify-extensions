import React, { useState, useEffect } from 'react';
import { Button, Dialog, List, Navigator, RadioButtonList, Screen, Stack, Text, TextField, useApi, useCartSubscription, reactExtension } from '@shopify/ui-extensions-react/point-of-sale';
import { ScrollView } from '@shopify/ui-extensions/point-of-sale';

const API_OMS_BASE_URL = "https://gorjana-uat.hotwax.io/api";
const API_MAARG_BASE_URL = "https://gorjana-maarg-uat.hotwax.io/rest/s1";

const Pickup = () => {
  const [selectedOption, setSelectedOption] = useState("Ship");

  const [zipCode, setZipCode] = useState("");
  const [zipCodeError, setZipCodeError] = useState("");
  const [availableStores, setAvailableStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedSKU, setSelectedSKU] = useState(null);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(false);
  const [showNoStoresMessage, setShowNoStoresMessage] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogContent, setDialogContent] = useState("");

  const api = useApi();
  const cart = useCartSubscription();

  useEffect(() => {
    const variantIds = cart.lineItems.map((item) => item.variantId);

    const fetchProductVariants = async () => {
      const results = await api.productSearch.fetchProductVariantsWithIds(variantIds);
      const products = results.fetchedResources.reduce((acc, variant) => {
        acc[variant.id] = variant;
        return acc;
      }, {});
      setProducts(products);
    };

    if (variantIds.length) {
      fetchProductVariants();
    }
  }, [cart.lineItems]);

  const removeLineItemAttributesSKU = (sku) => {
    const lineItem = cart.lineItems.find((item) => item.sku === sku);
    if (lineItem) {
      api.cart.removeLineItemProperties(lineItem.uuid, ["_pickupstore", "Pick Up", "_delivery_type"]);
      console.log(`Attributes removed from line item with SKU: ${sku}`);
    }
  };

  const addLineItemAttributesSKU = (sku, store) => {
    const lineItem = cart.lineItems.find((item) => item.sku === sku);
    if (lineItem) {
      api.cart.addLineItemProperties(lineItem.uuid, {
        "_pickupstore": store.value,
        "Pick Up": store.label,
        "_delivery_type": "pick_up_instore",
      });
      console.log(`Attributes added to line item with SKU: ${sku}`);
    }
  };

  const fetchStoresForSelectedSKU = async (sku) => {
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
      const storeList = await getAvailableStoresForSelectedSKU(zipCode, sku);
      setAvailableStores(storeList);
      if (storeList.length > 0) {
        setSelectedStore(storeList[0]);
      }
      setShowNoStoresMessage(storeList.length === 0);
    } catch (error) {
      console.error("Error fetching stores for SKU:", error);
    }
    setLoading(false);
  };

  const getAvailableStoresForSelectedSKU = async (zipCode, sku) => {
    try {
      const postcodeResponse = await fetch(`${API_OMS_BASE_URL}/postcodeLookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: {
            query: `postcode:${zipCode}`,
          },
        }),
      });
      const postcodeResult = await postcodeResponse.json();
      const { latitude, longitude } = postcodeResult.response.docs[0];
      const storeResponse = await fetch(`${API_OMS_BASE_URL}/storeLookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          viewSize: 150,
          filters: ["storeType: RETAIL_STORE", "pickup_pref: true"],
          point: `${latitude},${longitude}`,
          sortBy: "storeName asc",
        }),
      });
      const storeResult = await storeResponse.json();
      const stores = storeResult.response.docs.map((store) => ({
        label: `${store.storeName}`,
        value: store.storeCode,
        distance: `${Math.floor((Math.round(store.dist * 100) / 100) * 0.621371)} miles`,
      }));

       //sku = "216-009-G";

      const inventoryResponse = await fetch(`${API_MAARG_BASE_URL}/ofbiz-oms-usl/checkBopisInventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productStoreId: "STORE",
          internalNames: [sku],
          facilityIds: stores.map((store) => store.value),
          inventoryGroupId: "FAC_GRP",
        }),
      });
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
      const availableStores = stores.filter((store) =>
        inventoryByStore[store.value] && inventoryByStore[store.value][sku] > 0
      );
      const sortedStores = availableStores.sort((a, b) => parseInt(a.distance, 10) - parseInt(b.distance, 10));
      return sortedStores;    
    } catch (error) {
      console.error("Error fetching stores with inventory for SKU:", error);
      return [];
    }
  };

  const removeLineItemAttributes = () => {
    cart.lineItems.forEach((item) => {
      api.cart.removeLineItemProperties(item.uuid, ["_pickupstore", "Pick Up", "_delivery_type"]);
    });
    console.log("Attributes removed from line items.");
  };
  const addLineItemAttributes = () => {
    cart.lineItems.forEach((item) => {
      api.cart.addLineItemProperties(item.uuid, {
        "_pickupstore": selectedStore.value,
        "Pick Up": selectedStore.label,
        "_delivery_type": "pick_up_instore",
      });
    });
    console.log("Attributes added to line items.");
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
      const skus = cart.lineItems.map((item) => item.sku);
      const lineItems = cart.lineItems;
      const storeList = await getAvailableStores(zipCode, skus, lineItems);
      setAvailableStores(storeList);
      if (storeList.length > 0) {
        setSelectedStore(storeList[0]);
      }
      setShowNoStoresMessage(storeList.length === 0);
    } catch (error) {
      console.error("Error fetching stores:", error);
    }
    setLoading(false);
  };
  async function getAvailableStores(zipCode, skus, lineItems) {
    try {
      const postcodeResponse = await fetch(`${API_OMS_BASE_URL}/postcodeLookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: {
            query: `postcode:${zipCode}`,
          },
        }),
      });
      const postcodeResult = await postcodeResponse.json();
      const { latitude, longitude } = postcodeResult.response.docs[0];
      const storeResponse = await fetch(`${API_OMS_BASE_URL}/storeLookup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          viewSize: 150,
          filters: ["storeType: RETAIL_STORE", "pickup_pref: true"],
          point: `${latitude},${longitude}`,
          sortBy: "storeName asc",
        }),
      });
      const storeResult = await storeResponse.json();
      const stores = storeResult.response.docs.map((store) => ({
        label: `${store.storeName}`,
        value: store.storeCode,
        distance: `${Math.floor((Math.round(store.dist * 100) / 100) * 0.621371)} miles`,
      }));
       //skus = ["216-009-G", "231-106-G", "EXT-3-G"];
      const inventoryResponse = await fetch(`${API_MAARG_BASE_URL}/ofbiz-oms-usl/checkBopisInventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productStoreId: "STORE",
          internalNames: skus,
          facilityIds: stores.map((store) => store.value),
          inventoryGroupId: "FAC_GRP",
        }),
      });
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
      const availableStores = stores.filter((store) =>
        skus.every((sku) => {
          const lineItem = lineItems.find((item) => item.sku === sku);
          return (
            inventoryByStore[store.value] &&
            inventoryByStore[store.value][sku] >= (lineItem ? lineItem.quantity : 0)
          );
        })
      );
      const sortedStores = availableStores.sort((a, b) => parseInt(a.distance, 10) - parseInt(b.distance, 10));
      return sortedStores;      
    } catch (error) {
      console.error("Error fetching stores with inventory:", error);
      return [];
    }
  }

  return (
    <Navigator>
      <Screen name="DeliveryOptions" title="Delivery Options" onNavigateBack={() => {
          api.navigation.dismiss();
        }}>
        {cart.lineItems.length === 0 ? (          
          <Dialog
            isVisible={true}
            title="Cart is Empty"
            content="There are no items in the cart. Please add at least one item to proceed."
            actionText="OK"
            onAction={() => {
              api.navigation.dismiss();
            }}
            showSecondaryAction={false}
            type="alert"
          />
        ) : (
          <Stack
            direction="block"
            gap="200"
            padding="250"
            paddingBlock="350"
            paddingInline="450"
            alignItems="center"
            justifyContent="center"
          >
            <Text variant="headingLarge">Select Delivery Option</Text>
            {selectedOption === "Ship" && (
              <Button
                title="Save"
                type="primary"
                onPress={() => {
                  removeLineItemAttributes();
                  setDialogContent("Order will be delivered to the customer's address");
                  setDialogVisible(true);
                  console.log("Ship option selected and saved.");
                }}
              />
            )}
            {selectedOption === "Store Pickup Together" && (
              <Button
                title="Proceed"
                type="primary"
                onPress={() => {
                  api.navigation.navigate("StorePickup");
                }}
              />
            )}
            {selectedOption === "Store Pickup Separate" && (
              <Button
                title="Proceed"
                type="primary"
                onPress={() => {
                  api.navigation.navigate("StorePickupSeparate");
                }}
              />
            )}
            <ScrollView>
              <RadioButtonList
                items={[
                  "Ship",
                  "Store Pickup Together",
                  "Store Pickup Separate"
                ]}
                onItemSelected={(item) => setSelectedOption(item)}
                initialSelectedItem={selectedOption}
              />
            </ScrollView>
          </Stack>
        )}
        {dialogVisible &&
        <Dialog
          isVisible={dialogVisible}
          title="Success"
          content={dialogContent}
          actionText="OK"
          onAction={() => {
            setDialogVisible(false);
            api.navigation.dismiss();
          }}
          showSecondaryAction={false}
          type="alert"
        />
        }
      </Screen>

      <Screen
        name="StorePickup"
        title="Store Pickup"
        onNavigateBack={() => {
          api.navigation.navigate("DeliveryOptions");
        }}
        onNavigate={() => {
          setZipCode("");
          setAvailableStores([]);
          setZipCodeError("");
          setSelectedStore(null);
          setShowNoStoresMessage(false);
          setDialogContent("");
          setDialogVisible(false);
        }}>
        <TextField
          label="Search Available Pickup Stores"
          value={zipCode}
          onChange={(value) => {
            if (zipCodeError && value.length > 0) {
              setZipCodeError("");
            }
            setZipCode(value);
          }}
          error={zipCodeError}
          placeholder="Enter Zip Code"
        />
        <Button
          title="Find Stores"
          type="basic"
          onPress={fetchStores}
          isLoading={loading}
        />
        <ScrollView>
          {availableStores.length > 0 ? (
            <RadioButtonList
              items={availableStores.map((store) => `${store.label} (${store.distance})`)}
              onItemSelected={(item) => {
                const [label, distance] = item.split(" (");
                const store = availableStores.find((store) => store.label === label);

                setSelectedStore(store);

              }}
              initialSelectedItem={
                selectedStore
                  ? `${selectedStore.label} (${selectedStore.distance})`
                  : null
              }
            />

          ) : (
            showNoStoresMessage && <TextField label="No stores available for the entered zip code." disabled />
          )}
        </ScrollView>
        <Button
          title="Save"
          type="primary"
          isDisabled={!selectedStore}
          onPress={() => {
            if (selectedStore) {
              addLineItemAttributes();
              console.log("Store selected and attributes added.");
              setDialogContent(`Order will be ready to pick up at ${selectedStore.label}`);
              setDialogVisible(true);
              //  api.navigation.dismiss();
            } else {
              console.log("No store selected.");
            }
          }}
        />
        {
          dialogVisible &&
          <Dialog
          isVisible={dialogVisible}
          title="Success"
          content={dialogContent}
          actionText="OK"
          onAction={() => {
            setDialogVisible(false);
            api.navigation.dismiss();
          }}
          showSecondaryAction={false}
          type="alert"
        />
        }
        
      </Screen>
      <Screen
        name="StorePickupSeparate"
        title="Store Pickup Separate"
        onNavigateBack={() => {
          api.navigation.navigate("DeliveryOptions");
        }}
        onNavigate={() => {
          setZipCode("");
          setAvailableStores([]);
          setSelectedStore(null);
          setShowNoStoresMessage(false);
          setDialogContent("");
          setDialogVisible(false);
        }}
      >
        <ScrollView>
          <List
            title="Line Items"
            imageDisplayStrategy="always"
            data={cart.lineItems.map((item) => {
              const hasPickupStore = item.properties && item.properties["Pick Up"];
              return {
                id: item.uuid,
                leftSide: {
                  label: `SKU: ${item.sku}`,
                  image: { source: products[item.variantId]?.image, badge: item.quantity },
                  subtitle: hasPickupStore
                    ? [{ content: `Store: ${item.properties["Pick Up"]}`, color: "TextInteractive" }]
                    : [{ content: "No Pickup Store Selected", color: "TextHighlist" }],
                },
                rightSide: {
                  label: hasPickupStore ? "Remove Store" : "Select Store",
                  showChevron: true
                },
                onPress: () => {
                  if (hasPickupStore) {
                    removeLineItemAttributesSKU(item.sku);
                  } else {
                    setSelectedSKU(item.sku);
                    api.navigation.navigate("SelectStoreForSKU");
                  }
                },
              };
            })}
          />
        </ScrollView>
        {
          dialogVisible &&
          <Dialog
          isVisible={dialogVisible}
          title="Note"
          content={dialogContent}
          actionText="OK"
          onAction={() => {
            setDialogVisible(false);
            api.navigation.dismiss();
          }}
          showSecondaryAction={false}
          type="alert"
        />
        }        
      </Screen>
      <Screen
        name="SelectStoreForSKU"
        title="Select Store"
        onNavigateBack={() => {
          api.navigation.navigate("StorePickupSeparate");
        }}
        onNavigate={() => {
          setZipCode("");
          setZipCodeError("");
          setAvailableStores([]);
          setSelectedStore(null);
          setShowNoStoresMessage(false);
          setDialogContent("");
          setDialogVisible(false);
        }}
      >
        <TextField
          label="Search Available Pickup Stores"
          value={zipCode}
          onChange={(value) => {
            if (zipCodeError && value.length > 0) {
              setZipCodeError("");
            }
            setZipCode(value);
          }}
          error={zipCodeError}
          placeholder="Enter Zip Code"
        />
        <Button
          title="Find Stores"
          type="basic"
          onPress={() => fetchStoresForSelectedSKU(selectedSKU)}
          isLoading={loading}
        />
        <ScrollView>
          {availableStores.length > 0 ? (
            <RadioButtonList
              items={availableStores.map((store) => `${store.label} (${store.distance})`)}
              onItemSelected={(item) => {
                const [label] = item.split(" (");
                const store = availableStores.find((store) => store.label === label);
                setSelectedStore(store);
              }}
              initialSelectedItem={
                selectedStore
                  ? `${selectedStore.label} (${selectedStore.distance})`
                  : null
              }
            />
          ) : (
            showNoStoresMessage && (
              <TextField
                label="No stores available for the entered zip code."
                disabled
              />
            )
          )}
        </ScrollView>
        <Button
          title="Save"
          type="primary"
          isDisabled={!selectedStore}
          onPress={() => {
            if (selectedStore) {
              addLineItemAttributesSKU(selectedSKU, selectedStore);
              console.log("Store selected and attributes added for SKU:", selectedSKU);
              setDialogContent(`SKU: ${selectedSKU} will be ready for pickup at ${selectedStore.label}`);
              setDialogVisible(true);
            } else {
              console.log("No store selected.");
            }
          }}
        />
        {
          dialogVisible &&
          <Dialog
          isVisible={dialogVisible}
          title="Success"
          content={dialogContent}
          actionText="OK"
          onAction={() => {
            setDialogContent("");
            setDialogVisible(false);
            api.navigation.navigate("StorePickupSeparate");
          }}
          showSecondaryAction={false}
          type="alert"
        />
        }
        
      </Screen>
    </Navigator>
  );
};

export default reactExtension('pos.home.modal.render', () => <Pickup />);