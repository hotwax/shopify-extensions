// ===== Cross-component event contract =====
// Public contract for the host theme (cart events) and internal coordination
// events between this file's own custom elements. Keep the string values
// stable — host themes may already listen for the cart event names.
const PICKUP_EVENTS = {
  CART_ITEM_ADDED: 'hc:cart:item-added',
  CART_ITEM_ADD_ERROR: 'hc:cart:item-add-error',
  VARIANT_CHANGED: 'hc:pickup:variant-changed',
  STORE_CHANGED: 'hc:pickup:store-changed',
};

// ===== Shared config/state singletons =====
// pickupButton.liquid (modal mode) and pickupModal.liquid's nested store list
// both render `<hc-pickup-store-list>`/`<hc-pickup-button>` tags, but only one
// of them actually carries the block's real settings as data-* attributes —
// pickupModal.liquid renders the 'store' snippet with no locals, so its
// nested list's settings-derived attributes are blank. Whichever element
// connects first with a *real* dataset wins and populates this singleton;
// a blank dataset is ignored rather than locking in empty settings. This
// replicates the original `container = pickupBlockBtn || storeListElement`
// button-wins semantics without depending on DOM connection order.
const PickupConfig = {
  _settings: null,
  set(dataset) {
    if (this._settings) return;
    if (!dataset.storeSelectorDisplay) return;
    this._settings = {
      enablePickup: dataset.showPickupHere === 'true',
      storeSelectorDisplay: dataset.storeSelectorDisplay,
      viewSize: Number(dataset.maxStoresDisplay),
      storeProximity: Number(dataset.storeProximity),
      pickupItemProperty: dataset.pickupItemProperty === 'true',
      pickupItemPropertyLabel: dataset.pickupItemPropertyLabel,
      hcPickupProperty: '_pickupstore',
      enableWarehousePickup: dataset.enableWarehousePickup === 'true',
      showHomeStoreInSearch: dataset.showHomeStoreInSearch === 'true',
      showStoreWeeklyTimings: dataset.showStoreWeeklyTimings === 'true',
    };
  },
  get() {
    return this._settings || {};
  },
};

// Product/variant data (`data-hc-variants`, `data-product-id`) is sourced
// directly from Liquid's global `product` object in every render of
// snippets/store.liquid, so unlike PickupConfig it's equally "real" no
// matter which element supplies it first — plain first-wins is safe here.
const ProductVariantState = {
  _variants: null,
  _selected: undefined,
  initFromDataset(dataset) {
    if (this._variants) return;
    if (!dataset.hcVariants) return;
    try {
      this._variants = JSON.parse(dataset.hcVariants);
    } catch (error) {
      console.error('Error parsing product variants dataset:', error);
    }
  },
  getAll() {
    return this._variants;
  },
  getSelected() {
    return this._selected;
  },
  setSelected(variant) {
    this._selected = variant;
  },
};

function getMyStore() {
  const myStore = localStorage.getItem("defaultStore");
  return myStore ? JSON.parse(myStore) : null;
}

async function fetchProductVariantById(shopifyVariantId) {
  const variants = ProductVariantState.getAll();
  if (!variants) {
    console.log("Product Variants not initialized!");
    return null;
  }
  return variants.find(variant => variant.id == shopifyVariantId);
}

async function isVariantAvailable(shopifyVariantId) {
  const variant = await fetchProductVariantById(shopifyVariantId);
  return variant?.available;
}

async function getStoresByBaseCondition(payload) {
  const { point, distance, includeWarehouse, filters } = payload;
  return await getStores(500, undefined, point, distance, includeWarehouse, filters);
}

// TODO: Implement Searching Stores by partial zipcode.
async function getStores(viewSize, viewIndex, point, distance, includeWarehouse, filters = [], signal) {
  let stores = [];
  let totalStores;
  let requestBody = {};
  try {
  if (point) {
    requestBody.point = point;

    if (distance) {
      requestBody.distance = distance;
    }
  }
  if (viewSize) {
    requestBody.viewSize = viewSize;
  }
  if (viewIndex) {
    requestBody.viewIndex = viewIndex;
  }
  filters.push("pickup_pref: true");

  requestBody.filters = filters;
  if (includeWarehouse === 'true') {
    requestBody.filters.push("storeType: (RETAIL_STORE OR WAREHOUSE)");
  } else {
    requestBody.filters.push("storeType: RETAIL_STORE");
  }

  } catch (error) {
    console.error("Error getting location:", error.message);
    return stores; // return empty if location fails
  }

  try {
    const response = await fetch('https://dev-maarg.hotwax.io/rest/s1/api/stores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    const data = await response.json();
    stores = data?.docs || [];
    totalStores = data?.numFound || 0;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error('Error fetching stores:', error);
  }

  return { stores, totalStores: totalStores };
}

function formatTime24to12(time) {
  if (!time) return '';
  let [hour, minute] = time.split(':');
  hour = parseInt(hour, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = ((hour + 11) % 12) + 1;
  return `${hour}:${minute} ${suffix}`;
}

function getStoreTimings(store) {
  const days = [
    'sunday', 'monday', 'tuesday',
    'wednesday', 'thursday', 'friday', 'saturday'
  ];
  const today = new Date().getDay();
  const dayName = days[today];

  const open = store[`${dayName}_open`];
  const close = store[`${dayName}_close`];

  if (!open || !close) {
    return;
  }

  return `${formatTime24to12(open)} - ${formatTime24to12(close)}`;
}

function getCurrentLocation() {
  console.log('Getting current location...');
  return new Promise((resolve, reject) => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    } else {
      reject(new Error("Geolocation not supported"));
    }
  });
}

async function getLatLon(zipcode, signal) {
  if (!zipcode) {
    return;
  }
  let lat, lon;
  try {
    const response = await fetch(`https://dev-maarg.hotwax.io/rest/s1/api/geocode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        json: {
          params: {
            q: '*:*',
            fq: `postcode:\"${zipcode}\"`,
            d: "50"
          }
        }
      }),
      signal,
    });
    const data = await response.json();
    lat = data?.response?.docs[0]?.latitude;
    lon = data?.response?.docs[0]?.longitude;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error("Error fetching latitude and longitude:", error);
  }
  return { lat, lon };
}

function addToCart(currentVariantId, properties, quantity = 1) {
  return (async () => {
    if (!currentVariantId) {
      console.warn('addToCart called without a selected variant — aborted.');
      return;
    }
    try {
      const addResponse = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              id: currentVariantId,
              quantity: quantity,
              properties: properties
            }
          ]
        })
      });
      const addedItem = await addResponse.json();
      if (!addResponse.ok) {
        throw new Error(addedItem?.message || 'Error adding to cart');
      }

      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();

      // Public contract for the host theme: listen for PICKUP_EVENTS.CART_ITEM_ADDED
      // ('hc:cart:item-added') on document to react to a successful pickup
      // add-to-cart (toast, cart icon refresh, animation, redirect, etc.)
      // without this extension needing to know the theme's cart UI.
      // detail = { cart, addedItem, properties }
      // - cart: full parsed /cart.js response (item_count, items, total_price, ...)
      // - addedItem: parsed /cart/add.js response for the line item just added
      // - properties: the line item properties passed in (includes _pickupstore)
      document.dispatchEvent(new CustomEvent(PICKUP_EVENTS.CART_ITEM_ADDED, {
        detail: { cart, addedItem, properties }
      }));
    } catch (error) {
      console.log("Error adding to cart:", error);
      // Failure counterpart of PICKUP_EVENTS.CART_ITEM_ADDED above, for the
      // theme to surface the error to the shopper. detail = { error }
      document.dispatchEvent(new CustomEvent(PICKUP_EVENTS.CART_ITEM_ADD_ERROR, {
        detail: { error }
      }));
    }
  })();
}

async function checkPickupInventory(payload) {
  const response = await fetch('https://dev-maarg.hotwax.io/rest/s1/ofbiz-oms-usl/checkBopisInventory', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return data;
}

async function filterStoresByInventoryAvailability(stores, selectedVariantId) {
  let checkBopisInventoryResult = [];
  let storeCodes = [];
  let storesWithInventory = [];
  stores.forEach(
    store => {
      storeCodes.push(store.storeCode);
    }
  );
  const payload = {};

  payload.facilityIds = storeCodes;
  payload.internalNames = [selectedVariantId];
  payload.productStoreId = 'STORE';
  payload.inventoryGroupId = 'FAC_GRP';

  const response = await checkPickupInventory(payload);

  if (response && response.resultList) {
    checkBopisInventoryResult = response.resultList;
    checkBopisInventoryResult.forEach(inv => {
      if (inv.computedAtp > 0) {
        storesWithInventory.push(inv.facilityId);
      }
    });
  }
  return storesWithInventory;
}

// Shows a small, non-blocking inline message next to `anchorEl`, replacing
// the old blocking alert() for cases like "no variant selected".
function showPickupInlineMessage(anchorEl, message) {
  if (!anchorEl) return;
  let messageEl = anchorEl.nextElementSibling;
  if (!messageEl || !messageEl.classList.contains('hc-pickup-error')) {
    messageEl = document.createElement('span');
    messageEl.classList.add('hc-pickup-error');
    anchorEl.after(messageEl);
  }
  messageEl.textContent = message;
  clearTimeout(messageEl._hideTimeout);
  messageEl._hideTimeout = setTimeout(() => messageEl.remove(), 4000);
}

function createInlineMyStorePickupHead(store, payload) {
  console.log("Creating My Store Pickup Head Inline Div");
  const myStorePickupWrapper = document.createElement('div');
  myStorePickupWrapper.id = store.storeCode;
  myStorePickupWrapper.classList.add('hc-pc-mystore-pickup');

  const { isInStock, properties } = payload;

  // Clear any previous My Store Details
  myStorePickupWrapper.innerHTML = "";

  const headingSpan = document.createElement('span');
  headingSpan.textContent = `Pick up at ${store.storeName}`;

  myStorePickupWrapper.appendChild(headingSpan);

  if (PickupConfig.get().enablePickup && isInStock) {
    const myStorePickupBtn = createPickupHereButton(store, properties);

    myStorePickupWrapper.appendChild(myStorePickupBtn);
  }
  return myStorePickupWrapper;
}

function createPickupHereButton(store, properties) {
  const pickupBtn = document.createElement('button');
  pickupBtn.textContent = 'PICK UP IN STORE';
  pickupBtn.classList.add('pickup-btn');

  pickupBtn.addEventListener('click', (event) => {
    const settings = PickupConfig.get();
    const variant = ProductVariantState.getSelected();

    if (!variant?.id) {
      showPickupInlineMessage(pickupBtn, 'No variant selected!');
      return;
    }

    if (settings.pickupItemProperty) {
      (store.city || store.address1 || store.storeName) ? properties[settings.pickupItemPropertyLabel] = [store.storeName, store.address1, store.city].filter(Boolean).join(', ') : '';
    }
    addToCart(Number(variant.id), properties);
  });

  return pickupBtn;
}

function createPickupStoreDiv(store, payload) {

  console.log("This is store: ", store, " and payload: ", payload);
  if (!store) {
    console.log("Empty Value passes in store param");
    return;
  }

  const { isInStock, properties } = payload;
  const settings = PickupConfig.get();

  const newStoreDiv = document.createElement('div');
  newStoreDiv.classList.add('store');

  const storeDetailDiv = document.createElement('div');
  storeDetailDiv.classList.add('store-details');

  const storeName = document.createElement('h3');
  storeName.textContent = store.storeName;
  storeName.classList.add('store-name');
  const storeAddress = document.createElement('span');
  storeAddress.textContent = store.address1;

  storeDetailDiv.appendChild(storeName);
  storeDetailDiv.appendChild(storeAddress);

  if (store.city || store.postalCode || store.countryCode) {
    const storeFullAddress = document.createElement('span');
    storeFullAddress.textContent = [store.city, store.postalCode, store.countryCode].filter(Boolean).join(', ');
    storeDetailDiv.appendChild(storeFullAddress);
  }

  const storeInvContacts = document.createElement('div');
  storeInvContacts.classList.add('store-inv-contacts');
  const stockDetail = document.createElement('span');
  const stockDetailText = document.createElement('span');
  const stockDetailIcon = document.createElement('img');
  stockDetailIcon.classList.add('hc-icon');
  stockDetailIcon.src = isInStock ? '../assets/CheckIcon.svg' : '../assets/XSmallIcon.svg';
  stockDetailText.textContent = isInStock ? 'In Stock' : 'Out of Stock';
  stockDetail.append(stockDetailIcon, stockDetailText);
  storeInvContacts.appendChild(stockDetail);

  if (store.dist) {
    const storeDistance = document.createElement('span');
    storeDistance.textContent = `${store.dist.toFixed(2)} miles away`;
    storeDetailDiv.prepend(storeDistance);
  }

  if (store.storePhone) {
    const storePhone = document.createElement('span');
    const phoneIcon = document.createElement('img');
    phoneIcon.classList.add('hc-icon');
    phoneIcon.src = '../assets/PhoneIcon.svg';
    const storePhoneNum = document.createElement('span');
    storePhoneNum.textContent = store.storePhone;
    storePhone.appendChild(phoneIcon);
    storePhone.appendChild(storePhoneNum);
    storeInvContacts.appendChild(storePhone);
  }

  const storeTimings = getStoreTimings(store);

  if (settings.showStoreWeeklyTimings && storeTimings) {
    const timingSpan = document.createElement('span');
    const clockIcon = document.createElement('img');
    clockIcon.classList.add('hc-icon');
    clockIcon.src = '../assets/ClockIcon.svg';
    const storeTiming = document.createElement('span');
    storeTiming.textContent = storeTimings;

    timingSpan.appendChild(clockIcon);
    timingSpan.appendChild(storeTiming);
    storeInvContacts.appendChild(timingSpan);
  }

  newStoreDiv.append(storeDetailDiv, storeInvContacts);

  const pickupStoreWrapperDiv = document.createElement('div');
  pickupStoreWrapperDiv.id = store.storeCode;
  pickupStoreWrapperDiv.classList.add('pickup-store-wrapper');

  pickupStoreWrapperDiv.appendChild(newStoreDiv);

  if (settings.enablePickup && isInStock) {
    const pickupButton = createPickupHereButton(store, properties);
    if (settings.storeSelectorDisplay === 'inline') {
      storeInvContacts.appendChild(pickupButton);
    } else {
      pickupStoreWrapperDiv.appendChild(pickupButton);
    }
  }
  return pickupStoreWrapperDiv;
}

// ===== <hc-pickup-store-list> =====
// Owns the store list + pagination + inline "my store" head. Scoped to its
// own subtree via this.querySelector instead of module-level cached DOM
// refs, and holds its own paging state instead of a module-level object.
class PickupStoreList extends HTMLElement {
  constructor() {
    super();
    this._state = { viewIndex: 0, point: '', totalStores: 0, totalPages: 0, hasNextPage: false };
    this._searchAbortController = null;
    this._prevHandler = this._handlePrev.bind(this);
    this._nextHandler = this._handleNext.bind(this);
    this._onVariantChanged = this._onVariantChanged.bind(this);
    this._onStoreChanged = this._onStoreChanged.bind(this);
  }

  connectedCallback() {
    PickupConfig.set(this.dataset);
    ProductVariantState.initFromDataset(this.dataset);

    this._prevBtn()?.addEventListener('click', this._prevHandler);
    this._nextBtn()?.addEventListener('click', this._nextHandler);
    document.addEventListener(PICKUP_EVENTS.VARIANT_CHANGED, this._onVariantChanged);
    document.addEventListener(PICKUP_EVENTS.STORE_CHANGED, this._onStoreChanged);

    // The modal's nested store list is a child of <hc-pickup-modal>, which
    // controls its own visibility explicitly — only the standalone inline
    // instance checks its own availability on connect.
    if (this.dataset.storeSelectorDisplay === 'inline') {
      this._checkOwnAvailability();
    }
  }

  disconnectedCallback() {
    this._prevBtn()?.removeEventListener('click', this._prevHandler);
    this._nextBtn()?.removeEventListener('click', this._nextHandler);
    document.removeEventListener(PICKUP_EVENTS.VARIANT_CHANGED, this._onVariantChanged);
    document.removeEventListener(PICKUP_EVENTS.STORE_CHANGED, this._onStoreChanged);
    this._searchAbortController?.abort();
  }

  async _checkOwnAvailability() {
    const isAvailable = await isVariantAvailable(this.dataset.productId);
    if (!isAvailable) {
      this.style.display = 'none';
      return;
    }
    const variant = await fetchProductVariantById(this.dataset.productId);
    ProductVariantState.setSelected(variant);
  }

  _prevBtn() { return this.querySelector('#prev-page'); }
  _nextBtn() { return this.querySelector('#next-page'); }
  _pageInfo() { return this.querySelector('#page-info'); }
  _paginationEl() { return this.querySelector('#pagination'); }
  _storeListContainer() { return this.querySelector('#store-list'); }
  myStoreHeadEl() { return this.querySelector('#hc-pc-my-store'); }

  setViewIndex(index) { this._state.viewIndex = index; }
  setPoint(point) { this._state.point = point; }

  // Toggle only the inner #store-list div, not the whole element -- the "my
  // store" head and the SHOW/HIDE STORES toggle button are siblings inside
  // this same custom element and must stay visible while the list itself
  // collapses.
  showList() {
    const container = this._storeListContainer();
    if (container) container.style.display = 'block';
  }

  hideList() {
    const container = this._storeListContainer();
    if (container) container.style.display = 'none';
  }

  async _handlePrev() {
    const next = this._nextBtn();
    const prev = this._prevBtn();
    if (next) next.disabled = true;
    if (prev) prev.disabled = true;
    if (this._state.viewIndex > 0) {
      this._state.viewIndex--;
      const pageInfo = this._pageInfo();
      if (pageInfo) pageInfo.textContent = `${this._state.viewIndex + 1}`;
      // generateStoreListHTML sets prev/next disabled state based on the
      // freshly fetched page, so no need to set it again here.
      await this.generateStoreListHTML();
    } else if (next) {
      next.disabled = false;
    }
  }

  async _handleNext() {
    const next = this._nextBtn();
    const prev = this._prevBtn();
    if (next) next.disabled = true;
    if (prev) prev.disabled = true;
    const nextPage = this._state.viewIndex + 1;
    if (nextPage < this._state.totalPages) {
      this._state.viewIndex = nextPage;
      const pageInfo = this._pageInfo();
      if (pageInfo) pageInfo.textContent = `${nextPage + 1}`;
      // generateStoreListHTML sets prev/next disabled state based on the
      // freshly fetched page, so no need to set it again here.
      await this.generateStoreListHTML();
    } else if (prev) {
      prev.disabled = false;
    }
  }

  reset() {
    this._state.viewIndex = 0;
    this._state.point = '';
    const container = this._storeListContainer();
    if (container) container.innerHTML = '';
    const pageInfo = this._pageInfo();
    if (pageInfo) pageInfo.textContent = '1';
    const prev = this._prevBtn();
    if (prev) prev.disabled = true;
    const next = this._nextBtn();
    if (next) next.disabled = false;
  }

  async generateStoreListHTML() {
    const container = this._storeListContainer();
    if (!container) return;
    container.innerHTML = '';

    const settings = PickupConfig.get();
    const targetPage = this._state.viewIndex;
    const maxStoresToShow = settings.viewSize;

    this._searchAbortController?.abort();
    this._searchAbortController = new AbortController();

    let response;
    try {
      response = await getStores(maxStoresToShow, targetPage, this._state.point, settings.storeProximity, settings.enableWarehousePickup, [], this._searchAbortController.signal);
    } catch (error) {
      if (error.name === 'AbortError') return;
      throw error;
    }

    const stores = response.stores;
    const totalStores = response.totalStores;
    this._state.totalStores = totalStores;
    this._state.totalPages = Math.ceil(totalStores / maxStoresToShow);

    const paginationEl = this._paginationEl();

    if (!totalStores) {
      container.innerHTML = '<p style="text-align: center;">No stores found</p>';
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    if (paginationEl) paginationEl.style.display = 'flex';

    const storesWithInventory = await filterStoresByInventoryAvailability(stores, ProductVariantState.getSelected()?.sku);
    console.log("Stores fetched: ", stores.length, " and has inventory: ", storesWithInventory);

    let myStore = getMyStore();

    stores.forEach(store => {
      if (!settings.showHomeStoreInSearch && myStore && store.storeCode === myStore.storeCode) {
        return;
      }

      const properties = {
        "_pickupstore": store.storeCode
      };

      const payload = {
        isInStock: storesWithInventory?.includes(store.storeCode),
        properties: properties,
      };

      const newStoreDiv = createPickupStoreDiv(store, payload);

      container.appendChild(newStoreDiv);
      const customLine = document.createElement('hr');
      customLine.classList.add('custom-line');
      container.appendChild(customLine);
    });

    // Single source of truth for prev/next disabled state after any render.
    const nextBtn = this._nextBtn();
    if (nextBtn) nextBtn.disabled = targetPage + 1 >= this._state.totalPages;
    const prevBtn = this._prevBtn();
    if (prevBtn) prevBtn.disabled = targetPage === 0;
  }

  // Full store-card style "my store" head, used by the modal on open.
  async renderMyStoreCard() {
    const myStorePickupDivWrapper = this.myStoreHeadEl();
    if (!myStorePickupDivWrapper) return;
    const myStore = getMyStore();
    if (!myStore) return;

    const prevStoreDiv = myStorePickupDivWrapper.querySelector('.pickup-store-wrapper');
    if (prevStoreDiv) prevStoreDiv.remove();

    const payload = { properties: { "_pickupstore": myStore.storeCode } };
    const storesWithInventory = await filterStoresByInventoryAvailability([myStore], this.dataset.productSku);
    payload.isInStock = storesWithInventory && storesWithInventory.includes(myStore.storeCode);

    const newMyStoreDiv = createPickupStoreDiv(myStore, payload);
    myStorePickupDivWrapper.appendChild(newMyStoreDiv);
    myStorePickupDivWrapper.style.display = 'block';
  }

  // Refresh the inline "my store" head's inventory badge for a newly
  // selected variant. Only the inline instance reacts (mirrors the original
  // `#hc-pc-my-store[data-store-selector-display="inline"]` selector guard).
  async _onVariantChanged(event) {
    if (this.dataset.storeSelectorDisplay !== 'inline') return;

    const myStore = getMyStore();
    const myStorePickupWrapper = this.myStoreHeadEl();
    if (!myStore || !myStorePickupWrapper) return;

    myStorePickupWrapper.style.display = 'block';
    const storeCode = myStorePickupWrapper.querySelector('.hc-pc-mystore-pickup')?.id;
    const storesWithInventory = await filterStoresByInventoryAvailability([{ storeCode: storeCode }], event.detail.variant?.sku);
    const myStorePickupBtn = myStorePickupWrapper.querySelector('.pickup-btn');
    if (storesWithInventory && storesWithInventory.length > 0) {
      if (!myStorePickupBtn) {
        const properties = {
          "_pickupstore": storeCode
        };
        const newBtn = createPickupHereButton(myStore, properties);
        newBtn.classList.add('pickup-btn');
        myStorePickupWrapper.querySelector('.hc-pc-mystore-pickup')?.appendChild(newBtn);
      }
    } else {
      myStorePickupBtn?.remove();
    }
  }

  // Refresh the inline pickup head when the customer picks a new default
  // store from the My Store modal. Replaces the old
  // `document.querySelector('#hc-pc-my-store[data-store-selector-display="inline"]')`
  // reach-around with an event both sides opt into.
  async _onStoreChanged(event) {
    if (this.dataset.storeSelectorDisplay !== 'inline') return;
    if (PickupConfig.get().storeSelectorDisplay !== 'inline') return;

    const selectedMyStore = event.detail.store;
    const storesWithInventory = await filterStoresByInventoryAvailability([selectedMyStore], ProductVariantState.getSelected()?.sku);
    const isInStock = storesWithInventory.length ? true : false;

    const payload = {
      isInStock: isInStock,
      properties: {
        "_pickupstore": selectedMyStore.storeCode
      }
    };

    const newMyStoreDiv = createInlineMyStorePickupHead(selectedMyStore, payload);

    const myStorePickupWrapper = this.myStoreHeadEl();
    const myStoreDiv = myStorePickupWrapper?.querySelector('.hc-pc-mystore-pickup');

    const showAndHideStoresBtn = document.querySelector('#show-inline-stores-btn');
    if (showAndHideStoresBtn) {
      showAndHideStoresBtn.dataset.showStores = 'false';
      showAndHideStoresBtn.textContent = 'CHECK OTHER STORES';
    }

    const paginationEl = this._paginationEl();
    if (paginationEl) paginationEl.style.display = 'none';
    this.hideList();
    this.reset();

    if (myStoreDiv && myStorePickupWrapper) {
      myStorePickupWrapper.replaceChild(newMyStoreDiv, myStoreDiv);
      return;
    }
    if (myStorePickupWrapper) {
      myStorePickupWrapper.appendChild(newMyStoreDiv);
      myStorePickupWrapper.style.display = 'block';
    }
  }
}

if (!customElements.get('hc-pickup-store-list')) {
  customElements.define('hc-pickup-store-list', PickupStoreList);
}

// ===== <hc-pickup-button> =====
// Modal-trigger button. Only rendered when the block's display mode is
// "modal" (the inline case renders <hc-pickup-store-list> directly).
class PickupButton extends HTMLElement {
  connectedCallback() {
    PickupConfig.set(this.dataset);
    ProductVariantState.initFromDataset(this.dataset);

    this._button = this.querySelector('#pickup-today-btn');
    this._onClick = this._onClick.bind(this);
    this._button?.addEventListener('click', this._onClick);

    this._checkAvailability();
  }

  disconnectedCallback() {
    this._button?.removeEventListener('click', this._onClick);
  }

  async _checkAvailability() {
    const isAvailable = await isVariantAvailable(this.dataset.productId);
    if (!isAvailable) {
      this.style.display = 'none';
      return;
    }
    const variant = await fetchProductVariantById(this.dataset.productId);
    ProductVariantState.setSelected(variant);
  }

  _onClick() {
    document.querySelector('hc-pickup-modal')?.show();
  }
}

if (!customElements.get('hc-pickup-button')) {
  customElements.define('hc-pickup-button', PickupButton);
}

// ===== <hc-pickup-modal> =====
// Wraps a native <dialog> (wrapper pattern, not a customized built-in --
// `is="hc-pickup-modal"` extending HTMLDialogElement isn't supported in
// Safari). .showModal()/.close() give focus trapping and Escape-to-close
// for free.
class PickupModal extends HTMLElement {
  connectedCallback() {
    this._dialog = this.querySelector('dialog');
    this._closeBtn = this.querySelector('.hc-pickup-dialog-close');
    this._searchForm = this.querySelector('#hc-pickup-modal__search');
    this._zipInput = this.querySelector('#pickup-modal-zipcode-input');
    this._locationIcon = this.querySelector('#hc-location-icon');
    this._geoAbortController = null;

    this._onCloseClick = () => this.hide();
    // The dialog's native `close` event fires for both the close button and
    // Escape, so cleanup lives here rather than only in the close button
    // handler -- Escape-to-close must clean up identically.
    this._onDialogClose = () => this._cleanupAfterClose();
    this._onSearchSubmit = (event) => {
      event.preventDefault();
      this.searchStoresByZip(this._zipInput.value);
    };
    this._onLocationClick = () => this._handleLocationClick();

    this._closeBtn?.addEventListener('click', this._onCloseClick);
    this._dialog?.addEventListener('close', this._onDialogClose);
    this._searchForm?.addEventListener('submit', this._onSearchSubmit);
    this._locationIcon?.addEventListener('click', this._onLocationClick);
  }

  disconnectedCallback() {
    this._closeBtn?.removeEventListener('click', this._onCloseClick);
    this._dialog?.removeEventListener('close', this._onDialogClose);
    this._searchForm?.removeEventListener('submit', this._onSearchSubmit);
    this._locationIcon?.removeEventListener('click', this._onLocationClick);
    this._geoAbortController?.abort();
  }

  get storeList() {
    return this.querySelector('hc-pickup-store-list');
  }

  async show() {
    const settings = PickupConfig.get();
    if (this._zipInput) {
      this._zipInput.placeholder = `Search by zipcode (${settings.storeProximity} mile radius)`;
    }

    const storeList = this.storeList;
    if (storeList) {
      storeList.setViewIndex(0);
      await storeList.renderMyStoreCard();
      await storeList.generateStoreListHTML();
    }

    this._dialog?.showModal();
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this._dialog?.close();
  }

  _cleanupAfterClose() {
    if (this._zipInput) this._zipInput.value = '';
    this.storeList?.reset();
    document.body.style.overflow = 'scroll';
  }

  async _handleLocationClick() {
    try {
      if (this._zipInput) this._zipInput.value = '';
      const pickLocation = this._locationIcon.dataset.picklocation === 'true';
      if (pickLocation) {
        const storeList = this.storeList;
        storeList?.reset();
        storeList?.setPoint('');
        await storeList?.generateStoreListHTML();
        this._locationIcon.dataset.picklocation = 'false';
        this._locationIcon.src = '../assets/LocationIcon.svg';
        return;
      }
      const position = await getCurrentLocation();
      console.log(`Current location - Latitude: ${position.coords.latitude}, Longitude: ${position.coords.longitude}`);
      await this.searchStoresByLocation(position.coords.latitude, position.coords.longitude);

      this._locationIcon.dataset.picklocation = 'true';
      this._locationIcon.src = '../assets/LocationFilledIcon.svg';
    } catch (error) {
      console.error("Error in Searching stores by current location:", error);
    }
  }

  async searchStoresByZip(zipcode) {
    if (!zipcode) {
      console.error("Empty Input");
      return;
    }
    this._locationIcon.dataset.picklocation = 'false';
    this._locationIcon.src = '../assets/LocationIcon.svg';

    this._geoAbortController?.abort();
    this._geoAbortController = new AbortController();
    try {
      const { lat, lon } = await getLatLon(zipcode, this._geoAbortController.signal);
      await this.searchStoresByLocation(lat, lon);
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
  }

  async searchStoresByLocation(lat, lon) {
    const storeList = this.storeList;
    if (!storeList) return;
    storeList.reset();
    if (!lat || !lon) return;
    storeList.setPoint(`${lat},${lon}`);
    storeList.setViewIndex(0);
    await storeList.generateStoreListHTML();
  }
}

if (!customElements.get('hc-pickup-modal')) {
  customElements.define('hc-pickup-modal', PickupModal);
}

// Thin global forwarders kept in case anything outside this file still calls
// these by name (mirrors the existing closeMyStoreModal() forwarder pattern).
function showPickupModal() {
  document.querySelector('hc-pickup-modal')?.show();
}

function closePickupModal() {
  document.querySelector('hc-pickup-modal')?.hide();
}

function searchStoresByZip(zipcode) {
  document.querySelector('hc-pickup-modal')?.searchStoresByZip(zipcode);
}

function searchStoresByLocation(lat, lon) {
  document.querySelector('hc-pickup-modal')?.searchStoresByLocation(lat, lon);
}

// ===== Inline-mode bootstrap =====
// By the time DOMContentLoaded fires, every <hc-pickup-button>/
// <hc-pickup-store-list> present in the initial HTML has already been
// upgraded and run its connectedCallback (custom element upgrade happens
// synchronously as this deferred script registers the classes, which
// completes before DOMContentLoaded is dispatched) -- so PickupConfig and
// ProductVariantState are already populated here.
document.addEventListener('DOMContentLoaded', async function () {
  const settings = PickupConfig.get();
  if (!settings.storeSelectorDisplay) return;

  const pickupButtonEl = document.querySelector('hc-pickup-button');
  const storeListEl = document.querySelector('hc-pickup-store-list[data-store-selector-display="inline"]');
  const container = pickupButtonEl || storeListEl;
  if (!container) return;

  const variant = ProductVariantState.getSelected();

  console.log("Inline Mode Bootstrap: ", variant, " and settings: ", settings);

  if (variant) {
    if (settings.storeSelectorDisplay === 'inline' && storeListEl) {
      const paginationEl = storeListEl.querySelector('#pagination');
      if (paginationEl) paginationEl.style.display = 'none';

      let myStore = getMyStore();
      const myStorePickupDivWrapper = storeListEl.myStoreHeadEl();
      const checkOtherStoresBtn = document.createElement('u');
      checkOtherStoresBtn.id = 'show-inline-stores-btn';
      checkOtherStoresBtn.dataset.showStores = 'false';
      checkOtherStoresBtn.style.cursor = 'pointer';

      if (myStore) {
        const storesWithInventory = await filterStoresByInventoryAvailability([myStore], variant.sku);
        const isInStock = storesWithInventory && storesWithInventory.includes(myStore.storeCode);
        console.log("Does My Store has Inventory: ", isInStock);
        const payload = {
          isInStock: isInStock,
          properties: { "_pickupstore": myStore.storeCode },
        };

        const newMyStoreDiv = createInlineMyStorePickupHead(myStore, payload);
        myStorePickupDivWrapper.appendChild(newMyStoreDiv);
        myStorePickupDivWrapper.style.display = 'block';
        checkOtherStoresBtn.textContent = 'CHECK OTHER STORES';
      } else {
        checkOtherStoresBtn.textContent = 'SHOW PICKUP STORES';
      }

      checkOtherStoresBtn.addEventListener('click', async () => {
        if (checkOtherStoresBtn.dataset.showStores === 'false') {
          checkOtherStoresBtn.dataset.showStores = 'true';
          checkOtherStoresBtn.textContent = 'HIDE STORES';
          storeListEl.setViewIndex(0);
          storeListEl.showList();
          if (paginationEl) paginationEl.style.display = 'flex';
          await storeListEl.generateStoreListHTML();
        } else {
          storeListEl.reset();
          storeListEl.hideList();
          if (paginationEl) paginationEl.style.display = 'none';
          checkOtherStoresBtn.dataset.showStores = 'false';
          checkOtherStoresBtn.textContent = localStorage.getItem("defaultStore") ? 'CHECK OTHER STORES' : 'SHOW PICKUP STORES';
        }
      });

      myStorePickupDivWrapper.after(checkOtherStoresBtn);
    }
  } else {
    container.style.display = 'none';
    const paginationEl = storeListEl?.querySelector('#pagination');
    if (paginationEl) paginationEl.style.display = 'none';
  }
});

// TODO: Remove this with the standard event listener once available.
// Known fragility, intentionally left as-is: `className !== 'product-variant-id'`
// breaks if the variant input ever carries additional classes. Do not
// "fix" this without a deliberate follow-up decision -- only what happens
// after a valid variant-change is detected below has been refactored.
document.addEventListener('change', async function(event) {
  if (event.target.className !== 'product-variant-id') {
    return;
  }
  // TODO: Find a way to get the selected variant's SKU, either save it on the very start.
  const selectedVariantId = event?.target?.defaultValue; // This is only the variant ID

  console.log('Variant Changed Event Triggered: ', event);

  if (!selectedVariantId) return;

  const selectedVariant = await fetchProductVariantById(selectedVariantId);
  ProductVariantState.setSelected(selectedVariant);

  const isProdVariantAvailable = await isVariantAvailable(selectedVariant?.id);

  const settings = PickupConfig.get();
  const storeListEl = document.querySelector('hc-pickup-store-list[data-store-selector-display="inline"]');
  const showAndHideStoresBtn = document.querySelector('#show-inline-stores-btn');

  if (isProdVariantAvailable) {
    if (settings.storeSelectorDisplay === 'inline' && storeListEl) {
      storeListEl.hideList();
      storeListEl.reset();
      await storeListEl.generateStoreListHTML();

      document.dispatchEvent(new CustomEvent(PICKUP_EVENTS.VARIANT_CHANGED, {
        detail: { variant: selectedVariant }
      }));

      if (showAndHideStoresBtn) {
        showAndHideStoresBtn.style.display = 'block';
        showAndHideStoresBtn.dataset.showStores = 'false';
        showAndHideStoresBtn.textContent = localStorage.getItem("defaultStore") ? 'CHECK OTHER STORES' : 'SHOW PICKUP STORES';
      }
    }
  } else {
    storeListEl?.reset();
    storeListEl?.hideList();
    const myStorePickupDivWrapper = document.querySelector('#hc-pc-my-store');
    if (myStorePickupDivWrapper) {
      myStorePickupDivWrapper.style.display = 'none';
    }
    if (showAndHideStoresBtn) {
      showAndHideStoresBtn.style.display = 'none';
    }
  }
});

function closeMyStoreModal() {
  const myStoreModal = document.querySelector('my-store-modal');
  console.log("Closing My Store Modal...");
  myStoreModal.querySelector('#mystore-modal').scrollTop = 0;
  myStoreModal.style.display = 'none';
  document.body.style.overflow = 'scroll';
}

class MyStore extends HTMLElement {
  constructor() {
    super();
    console.log("MyStore element created (constructor)");
  }

  connectedCallback() {
    const labelDiv = this.querySelector('#my-store-label');
    if (labelDiv) {
      labelDiv.textContent = labelDiv.textContent + ' : ';
    }

    const storeId = this.dataset.storeId;
    const customerId = this.dataset.customerId;

    console.log("MyStore connected:", { storeId, customerId });

    this.setMyStore();
  }

  disconnectedCallback() {
    console.log("MyStore element removed from the DOM");
  }

  async getCustomerDefaultStore() {
    try {
      if (!this.dataset.customerId) {
        const store = getMyStore();
        return store;
      }
      const response = await fetch(
        `https://dev-oms.hotwax.io/api/getShopifyCustomerDefaultStore?customerId=${this.dataset.customerId}&shopifyShopId=${this.dataset.storeId}`
      );

      const resp = await response.json();
      console.log("API response:", resp);

      if (!resp?.customer?.facilityId) {
        localStorage.removeItem("defaultStore");
      }

      const myStoreModal = document.querySelector('my-store-modal');
      const includeWarehouse = myStoreModal.dataset.showWarehouse;
      const storeSearchProximity = myStoreModal.dataset.storeSearchProximity;

      const payload = {};

      if (includeWarehouse) payload.includeWarehouse = includeWarehouse;
      if (storeSearchProximity) payload.distance = storeSearchProximity;
      payload.filters = [`storeCode: ${resp.customer.facilityId}`];

      const storeResponse = await getStoresByBaseCondition(payload);

      const store = storeResponse?.stores?.[0];
      console.log("Default store:", store);
      return store;

    } catch (err) {
      console.error("Error fetching customer default store:", err);
      return null;
    }
  }

  async setMyStore() {
    const myStoreDetailsWrapper = this.querySelector('#my-store-details');

    if (!myStoreDetailsWrapper) {
      console.warn("No #my-store-details wrapper found");
      return;
    }

    const store = await this.getCustomerDefaultStore();

    if (!store) {
      console.log("Store not found");
      const storeSelectText = document.createElement('span');
      storeSelectText.id = 'detail-text';
      storeSelectText.textContent = 'Select a Store';
      storeSelectText.style.cursor = 'pointer';
      myStoreDetailsWrapper.appendChild(storeSelectText);

      storeSelectText.addEventListener('click', () => this.openMyStoreModal());
      return;
    }

    localStorage.setItem("defaultStore", JSON.stringify(store));

    console.log("Store code:", store.storeCode);
    console.log("Store name:", store.storeName);

    const storeDetailText = document.createElement('span');
    storeDetailText.id = 'detail-text'
    storeDetailText.style.cursor = 'pointer';
    myStoreDetailsWrapper.appendChild(storeDetailText);

    const timings = getStoreTimings(store);
    console.log("Store timings:", timings);

    storeDetailText.textContent = `${store.storeName}${timings ? ` Open: ${timings}` : ''}`;

    storeDetailText.addEventListener('click', () => this.openMyStoreModal());
  }

  openMyStoreModal() {
    const modal = document.querySelector('my-store-modal');
    if (modal) {
      console.log("Here I am");
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    } else {
      console.error("<my-store-modal> not found in DOM");
    }
  }
}

class MyStoreModal extends HTMLElement {
  constructor() {
    super();
    this.style.display = 'none';
  }

  async connectedCallback() {
    await this.intialize();
    this.querySelector('#hc-ms-close-btn').addEventListener('click', () => { this.closeMyStoreModal(); });
  }

  async intialize () {
    try {
      const response = await getStoresByBaseCondition(this.getBaseConditionsForStoreLookup());
      console.log("Pickup stores:", response, " and ", response?.stores?.length);

      const stores = response?.stores;

      const modal = this.querySelector('#mystore-modal')
      const myStore = getMyStore();

      console.log("This is my store", myStore);

      if (myStore) {
        const myStoreHead = document.createElement('h3');
        myStoreHead.id = 'my-store-head';
        myStoreHead.textContent = 'My Store:';
        myStoreHead.style.fontWeight = 'bold';

        const defaultStore = this.createStoreDiv(myStore);
        defaultStore.id = 'selected-my-store';
        defaultStore.querySelector('.hc-ms-store-action')?.remove();
        modal.prepend(defaultStore);
        modal.prepend(myStoreHead);
        const customLine = document.createElement('hr');
        customLine.classList.add('custom-line');
        customLine.style.marginBottom = "20px";
        defaultStore.after(customLine);
      } else {
        const noStoreSelectedHead = document.createElement('h3');
        noStoreSelectedHead.textContent = 'No Store Selected';
        noStoreSelectedHead.id = 'my-store-head';
        modal.prepend(noStoreSelectedHead);
        noStoreSelectedHead.style.fontWeight = 'bold';
      }

      this.createStoreList(stores);
      const myStoreSearchForm =  modal.querySelector('#my-store-search-form');
      const findStoresButton = modal.querySelector('.hc-modal-find-stores-btn');
      const locationIcon = modal.querySelector('#hc-ms-location-icon');

      myStoreSearchForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        console.log("New this is new search");
        try {
          // Prevent user to run this more than once simultaneously.
          findStoresButton.disabled = true;
          if (locationIcon.dataset.picklocation === 'true') {
            locationIcon.dataset.picklocation = 'false';
            locationIcon.src = '../assets/LocationIcon.svg';
          }
          const zipCodeInput = this.querySelector('#my-store-modal-zipcode-input').value;
          const storesByZip = await this.getStoresByZip(zipCodeInput);
          this.replaceStoreListDivAndHead(storesByZip?.stores);
        } catch (error) {
          console.error("Error is Search: ", error);
        }
        // Enable the button again
        findStoresButton.disabled = false;
      });

      locationIcon.addEventListener('click', async () => {
        try {
          findStoresButton.disabled = true;
          let stores = undefined;
          if (locationIcon.dataset.picklocation === 'false') {
            locationIcon.dataset.picklocation = 'true';
            locationIcon.src = '../assets/LocationFilledIcon.svg';
            stores = await this.getStoresByCurrentLocation();
          }
          else {
            locationIcon.src = '../assets/LocationIcon.svg';
            locationIcon.dataset.picklocation = 'false';
            stores = await getStoresByBaseCondition(this.getBaseConditionsForStoreLookup());
          }
          // Clear any input in search bar
          this.querySelector('#my-store-modal-zipcode-input').value = '';

          this.replaceStoreListDivAndHead(stores?.stores);
        } catch (error) {
          console.error("Error in finding Nearby Stores: ", error);
        }

        findStoresButton.disabled = false;
      });

    } catch (err) {
      console.error("Error fetching pickup stores:", err);
    }
  }

  async reintialize () {
    this.querySelector('#my-store-head')?.remove();
    this.querySelector('#selected-my-store')?.remove();
    this.querySelector('#store-list-head')?.remove();
    this.querySelector('.hc-store-list')?.remove();
    this.querySelector('#my-store-modal-zipcode-input').value = '';
    const findStoresBtn = this.querySelector('.hc-modal-find-stores-btn');
    findStoresBtn.parentNode.replaceChild(findStoresBtn.cloneNode(true), findStoresBtn);
    const locationIcon = this.querySelector('#hc-ms-location-icon');
    locationIcon.parentNode.replaceChild(locationIcon.cloneNode(true), locationIcon);
    this.querySelector('.custom-line')?.remove();
    this.intialize();
  }

  disconnectedCallback() {
    console.log("MyStoreModal element removed from the DOM");
  }

  async setShopifyCustomerDefaultStore(store) {
    console.log("Setting default store");
    if (!store) {
      console.log("Empty Input!")
      return;
    }

    console.log(this.dataset.customerId, " and ", this.dataset.shopId);
    if (this.dataset.customerId && this.dataset.shopId) {
      await fetch(`https://dev-oms.hotwax.io/api/setShopifyCustomerDefaultStore`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          'customerId': this.dataset.customerId,
          'shopifyShopId': this.dataset.shopId,
          'facilityId': store.storeCode
        })
      })
    }
    this.dataset.storeCode = store.storeCode;

    console.log("Setting up done for default store");
  }

  createStoreList(stores) {

    if (!stores) {
      console.log("Empty List passed.");
      return;
    }

    const storeListDiv = document.createElement('div');
    storeListDiv.classList.add('hc-store-list');
    const myStore = getMyStore();
    const modal = this.querySelector("#mystore-modal");
    stores.forEach(store => {
      const showHomeStoreInSearch = this.dataset.showHomeStoreInSearch === 'true';
      const storeDiv = this.createStoreDiv(store);
      if (myStore && !showHomeStoreInSearch && store.storeCode === myStore.storeCode) {
        storeDiv.classList.add('hc-hide');
      }
      storeListDiv.appendChild(storeDiv);

      const customLine = document.createElement('hr');
      customLine.classList.add('custom-line');
      storeListDiv.appendChild(customLine);
      if (myStore && !showHomeStoreInSearch && store.storeCode === myStore.storeCode) {
        customLine.classList.add('hc-hide');
      }
    });
    const storeListHeadText = myStore ? 'Other Stores: ' : 'Select a Store: ';
    const storeListHead = document.createElement('h3');
    storeListHead.id = 'store-list-head';
    storeListHead.textContent = storeListHeadText;
    storeListHead.style.fontWeight = "bold";
    modal.appendChild(storeListHead);
    modal.appendChild(storeListDiv);
    return storeListDiv;
  }

  replaceStoreListDivAndHead (stores) {
    const oldStoreListDiv = this.querySelector('.hc-store-list');
    this.querySelector('#store-list-head')?.remove();
    const newStoreListDiv = this.createStoreList(stores);
    oldStoreListDiv?.remove();
  }

  createStoreDiv(store) {
    const storeName = document.createElement('h3');
    storeName.textContent = store.storeName;
    storeName.classList.add('store-name');

    const storeAddress = document.createElement('span');
    storeAddress.textContent = store.address1;

    const storeFullAddress = document.createElement('span');
    storeFullAddress.textContent = [store.city, store.postalCode, store.countryCode].filter(Boolean).join(', ');

    const storeDetails = document.createElement('div');
    if (store.dist) {
      const storeDistance = document.createElement('span');
      storeDistance.textContent = `${store.dist.toFixed(2)} miles away`;
      storeDetails.appendChild(storeDistance);
    }
    storeDetails.classList.add('store-details');
    storeDetails.appendChild(storeName);
    storeDetails.appendChild(storeAddress);
    storeDetails.appendChild(storeFullAddress);

    const storeContacts = document.createElement('div');
    storeContacts.classList.add('store-inv-contacts');

    if (store.storePhone) {
      const phoneSpan = document.createElement('span');
      const phoneIconImg = document.createElement('img');
      phoneIconImg.classList.add('hc-icon');
      phoneIconImg.src = '../assets/PhoneIcon.svg'
      phoneSpan.appendChild(phoneIconImg);
      const storePhoneNum = document.createElement('span');
      storePhoneNum.textContent = store.storePhone;

      phoneSpan.appendChild(storePhoneNum);
      storeContacts.appendChild(phoneSpan);
    }

    const timing = getStoreTimings(store);

    if (this.dataset.showTimings === 'true' && timing) {

      const timingSpan = document.createElement('span');
      const clockIcon = document.createElement('img');
      clockIcon.classList.add('hc-icon');
      clockIcon.src = '../assets/ClockIcon.svg';
      timingSpan.appendChild(clockIcon);
      const storeTimings = document.createElement('span');
      storeTimings.textContent = `Open Today: ${timing}`;
      timingSpan.appendChild(storeTimings);
      storeContacts.appendChild(timingSpan);
    }

    const myStore = getMyStore();

    // If customer has no default store
    // If store being added to list is not my store
    if (!myStore || myStore.storeCode !== store.storeCode) {
      let setStoreAction = document.createElement('p');
      setStoreAction.textContent ='Store Pickup Unavailable Here';
      if (store.pickup_pref === 'true') {
        setStoreAction = document.createElement('u');
        setStoreAction.textContent ='SET AS MY STORE';
        setStoreAction.style.cursor = 'pointer'

        setStoreAction.addEventListener('click', () => {
          this.updateMyStore(store);
        });
      }

      setStoreAction.classList.add('hc-ms-store-action');
      storeDetails.appendChild(setStoreAction);
    }

    const storeDiv = document.createElement('div');
    storeDiv.classList.add('store');
    storeDiv.id = store.storeCode;
    storeDiv.appendChild(storeDetails);
    if (storeContacts.childElementCount) {
     storeDiv.appendChild(storeContacts);
    } else {
      storeContacts.remove();
      storeDetails.style.maxWidth = 'none';
    }

    return storeDiv;
  }

  updateMyStore(selectedMyStore) {

    // Validate the Input
    if (!selectedMyStore) {
      console.log("Empty Value Passed");
      return;
    }

    const modal = document.querySelector('#mystore-modal');

    // Clear Previous My Store
    modal.querySelector('#selected-my-store')?.remove();
    // Create a new Store div
    const newSelectedMyStoreDiv = this.createStoreDiv(selectedMyStore);
    newSelectedMyStoreDiv.id = 'selected-my-store';
    newSelectedMyStoreDiv.querySelector('.hc-ms-store-action')?.remove();
    const customLine = document.createElement('hr');
    customLine.classList.add('custom-line');
    customLine.style.marginBottom = "20px";
    newSelectedMyStoreDiv.after(customLine);

    modal.prepend(newSelectedMyStoreDiv);

    const myStoreHead = modal.querySelector('#my-store-head');
    myStoreHead.textContent = 'My Store:';
    modal.prepend(myStoreHead);

    // Save the prevMyStore before updating the my Store in the localstorage
    // If no store was selected then set it as previous store.
    const prevMyStore = getMyStore() || selectedMyStore;
    localStorage.setItem("defaultStore", JSON.stringify(selectedMyStore));
    const storeListDiv = this.querySelector('.hc-store-list');

    const prevMyStoreDiv = storeListDiv.querySelector(`#${CSS.escape(prevMyStore.storeCode)}`);

    // My Store could or could not be included in the store list, based on app embed block setting.
    if (prevMyStore.storeCode !== selectedMyStore.storeCode && prevMyStoreDiv) {
      const setStoreAction = document.createElement('u');
      setStoreAction.textContent = 'SET AS MY STORE';
      setStoreAction.style.cursor = 'pointer';
      setStoreAction.classList.add('hc-ms-store-action');

      setStoreAction.addEventListener('click', () => {
        this.updateMyStore(prevMyStore);
      });

      prevMyStoreDiv.querySelector('.store-details')?.appendChild(setStoreAction);
    }

    const selectedMyStoreDiv = storeListDiv.querySelector(`#${CSS.escape(selectedMyStore.storeCode)}`);
    selectedMyStoreDiv.querySelector('.hc-ms-store-action').remove();

    this.setShopifyCustomerDefaultStore(selectedMyStore);

    const myStoreBlockDetails = document.querySelector('my-store').querySelector('#my-store-details');
    const storeTimings = getStoreTimings(selectedMyStore);
    myStoreBlockDetails.querySelector('#detail-text').textContent = `${selectedMyStore.storeName}${storeTimings ? ` Open: ${storeTimings}` : ''}`;
    const showMyStoreInSearch = this.dataset.showHomeStoreInSearch === 'true';
    if (!showMyStoreInSearch) {
      selectedMyStoreDiv.classList.add('hc-hide');
      const customLine =  selectedMyStoreDiv.nextElementSibling;

      if (customLine.tagName === 'HR') {
        customLine.classList.add('hc-hide');
      }

      if (prevMyStoreDiv.id !== selectedMyStoreDiv.id) {
        prevMyStoreDiv.classList.remove('hc-hide');
        const prevMyStoreCustomLine = prevMyStoreDiv.nextElementSibling;
        if (prevMyStoreCustomLine.tagName === 'HR') {
          prevMyStoreCustomLine.classList.remove('hc-hide');
        }
      }
    }
    this.closeMyStoreModal();

    this.updateMyStoreInPickup(selectedMyStore);
  }

  // Replaces the old direct DOM reach-around into the inline pickup store
  // list with a coordination event -- see PickupStoreList._onStoreChanged.
  updateMyStoreInPickup(selectedMyStore) {
    document.dispatchEvent(new CustomEvent(PICKUP_EVENTS.STORE_CHANGED, {
      detail: { store: selectedMyStore }
    }));
  }

  async getStoresByCurrentLocation () {
    const position = await getCurrentLocation();

    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    const payload = this.getBaseConditionsForStoreLookup();

    console.log("This is payload from currecnt location search function: ", payload);

    if (lat && lon) {
      payload.point = `${lat},${lon}`;
    } else {
      console.error("No Stores to lookup!");
      return;
    }

    return await getStoresByBaseCondition(payload);
  }

  async getStoresByZip (zipcode) {

    const { lat, lon } = await getLatLon(zipcode);

    const payload = this.getBaseConditionsForStoreLookup();

    if (lat && lon) {
      payload.point = `${lat},${lon}`;
    } else {
      console.error("No Stores to lookup!");
      return;
    }

    return await getStoresByBaseCondition(payload);
  }

  getBaseConditionsForStoreLookup () {
    const showWarehouse = this.dataset.showWarehouse;
    const storeSearchProximity = this.dataset.storeSearchProximity;

    console.log(showWarehouse, ' and ', storeSearchProximity);

    const payload = {};

    if (showWarehouse) payload.includeWarehouse = showWarehouse;
    if (storeSearchProximity) payload.distance = storeSearchProximity;

    return payload;
  }

  closeMyStoreModal () {
    console.log("Closing My Store Modal...");
    this.querySelector('#mystore-modal').scrollTop = 0;
    this.style.display = 'none';
    document.body.style.overflow = 'scroll';
    this.reintialize();
  }
}

if (!customElements.get("my-store")) {
  customElements.define("my-store", MyStore);
}

if (!customElements.get("my-store-modal")) {
  customElements.define("my-store-modal", MyStoreModal);
}
