import { test, expect } from '@playwright/test';

async function picker(page, options = {}) {
  await page.goto('/?demo=1');
  await page.evaluate(async options => {
    document.body.innerHTML = '<section id="picker"><div class="location-input"><input data-map-search aria-label="Search chosen location"></div><p data-map-status role="status"></p><div data-location-map style="height:280px"></div></section>';
    const state = window.__genericPicker = { maps: [], picks: [], failures: [], requests: [], country: options.country || '', pending: [], pendingSearch: [], fixtures: {
      hotel: { placeId: 'hotel', text: 'Selected Hotel, Dhaka, Bangladesh', latitude: 23.7, longitude: 90.4, countryCode: 'BD', countryName: 'Bangladesh', attributions: [] },
      foreign: { placeId: 'foreign', text: 'Foreign Hotel, USA', latitude: 41, longitude: -87, countryCode: 'US', countryName: 'United States', attributions: [] },
    } };
    class Map {
      constructor(_container, settings) { this.settings = settings; this.listeners = new globalThis.Map(); this.center = settings.center; state.maps.push(this); }
      addListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); return { remove: () => this.listeners.get(name)?.delete(callback) }; }
      emit(name, value) { for (const callback of this.listeners.get(name) || []) callback(value); }
      panTo(center) { this.center = center; queueMicrotask(() => this.emit('idle')); }
      setZoom(zoom) { this.zoom = zoom; }
      getCenter() { return this.center; }
    }
    window.google = { maps: { importLibrary: async () => ({ Map }), event: { clearInstanceListeners: map => map.listeners.clear() } } };
    const client = {
      ready: async () => ({}),
      async suggest(query, fieldId, request) { state.requests.push({ query, fieldId, request }); return [{ placeId: 'hotel', text: 'Hotel suggestion', main: 'Hotel suggestion', secondary: 'Dhaka, Bangladesh' }]; },
      async select() { if (options.holdSearch) await new Promise(resolve => state.pendingSearch.push(resolve)); return state.fixtures.hotel; },
      async restore(id) { if (options.hold) await new Promise(resolve => state.pending.push(resolve)); return state.fixtures[id]; },
      async describeDeviceLocation(point) { state.nearbyRequests = (state.nearbyRequests || 0) + 1; return { nearbyName: 'Nearby hotel', nearbyAddress: 'Approximate landmark', attributions: [] }; },
      discardSession() {},
    };
    const { mountPickupMap } = await import('/pickup-map.js');
    state.cleanup = mountPickupMap(document.querySelector('#picker'), {
      client, fieldId: options.fieldId || 'dropoff', label: options.label || 'drop-off', countryCode: () => state.country,
      onPick: place => state.picks.push(place), onError: message => state.failures.push(message),
    });
  }, options);
  await expect.poll(() => page.evaluate(() => window.__genericPicker.maps.length)).toBe(1);
}

test('clicking a named Google place previews its exact identity and centers the map without closing it', async ({ page }) => {
  await picker(page, { country: 'BD' });
  await page.evaluate(() => window.__genericPicker.maps[0].emit('click', { placeId: 'hotel', stop() { window.__genericPicker.stopped = true; }, latLng: { lat: () => 0, lng: () => 0 } }));
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.placeId)).toBe('hotel');
  const result = await page.evaluate(() => ({ place: window.__genericPicker.picks.at(-1), center: window.__genericPicker.maps[0].center, zoom: window.__genericPicker.maps[0].zoom, clickable: window.__genericPicker.maps[0].settings.clickableIcons, nearby: window.__genericPicker.nearbyRequests || 0, stopped: window.__genericPicker.stopped }));
  expect(result.place).toMatchObject({ placeId: 'hotel', latitude: 23.7, longitude: 90.4, countryCode: 'BD', source: 'map-place' });
  expect(result.center).toEqual({lat:23.7,lng:90.4}); expect(result.zoom).toBe(17);
  await expect(page.locator('#picker')).toBeVisible();
  expect(result.clickable).toBe(true); expect(result.stopped).toBe(true); expect(result.nearby).toBe(0);
});

test('a stop search result previews its area with the exact address while leaving the map available for refinement', async ({ page }) => {
  await picker(page, { country: 'BD', fieldId: 'stop:stop-2', label: 'stop 2' });
  await page.getByLabel('Search chosen location').fill('Hotel');
  await page.getByRole('option', { name: 'Hotel suggestion', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.placeId)).toBe('hotel');
  expect(await page.evaluate(() => window.__genericPicker.requests[0])).toEqual({ query: 'Hotel', fieldId: 'stop:stop-2-map-search', request: { countryCode: 'BD' } });
  await expect(page.getByLabel('Search chosen location')).toHaveValue('Selected Hotel, Dhaka, Bangladesh');
  expect(await page.evaluate(() => window.__genericPicker.picks.at(-1).placeId)).toBe('hotel');
  await expect(page.locator('[data-map-status]')).toContainText('Showing Selected Hotel');
  expect(await page.evaluate(() => window.__genericPicker.maps[0].center)).toEqual({lat:23.7,lng:90.4});
  await expect(page.locator('#picker')).toBeVisible();
});

test('an arbitrary map pin retains raw coordinates for explicit confirmation without snapping to a nearby business', async ({ page }) => {
  await picker(page, { label: 'drop-off' });
  await page.evaluate(() => window.__genericPicker.maps[0].emit('click', { latLng: { lat: () => 22.7095, lng: () => 90.3667 } }));
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.nearbyName)).toBe('Nearby hotel');
  const selected = await page.evaluate(() => window.__genericPicker.picks.at(-1));
  expect(selected).toMatchObject({ latitude: 22.7095, longitude: 90.3667, source: 'map', nearbyName: 'Nearby hotel' });
  expect(selected).not.toHaveProperty('placeId'); expect(selected).not.toHaveProperty('countryCode');
});

test('a named map place in another country cannot overwrite a restricted trip field', async ({ page }) => {
  await picker(page, { country: 'BD' });
  await page.evaluate(() => window.__genericPicker.maps[0].emit('click', { placeId: 'foreign', stop() {} }));
  await expect(page.locator('[data-map-status]')).toContainText('same country');
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
  expect(await page.evaluate(() => window.__genericPicker.failures)).toHaveLength(1);
});

test('country changes and unmounting invalidate delayed map-place selections', async ({ page }) => {
  await picker(page, { country: 'BD', hold: true });
  await page.evaluate(() => window.__genericPicker.maps[0].emit('click', { placeId: 'hotel', stop() {} }));
  await expect.poll(() => page.evaluate(() => window.__genericPicker.pending.length)).toBe(1);
  await page.evaluate(() => { window.__genericPicker.country = 'US'; window.__genericPicker.pending.shift()(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
  await page.evaluate(() => { window.__genericPicker.country = 'BD'; window.__genericPicker.maps[0].emit('click', { placeId: 'hotel', stop() {} }); });
  await expect.poll(() => page.evaluate(() => window.__genericPicker.pending.length)).toBe(1);
  await page.evaluate(() => { window.__genericPicker.cleanup(); window.__genericPicker.pending.shift()(); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
});


test('moving a searched-place pin discards its Place ID and retains the exact new coordinates', async ({ page }) => {
  await picker(page, {country:'BD'});
  await page.getByLabel('Search chosen location').fill('Hotel');
  await page.getByRole('option', {name:'Hotel suggestion',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.placeId)).toBe('hotel');
  await page.evaluate(() => {
    const map=window.__genericPicker.maps[0];map.emit('dragstart');map.center={lat:23.701,lng:90.402};map.emit('dragend');map.emit('idle');
  });
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.nearbyName)).toBe('Nearby hotel');
  const selected=await page.evaluate(() => window.__genericPicker.picks.at(-1));
  expect(selected).toMatchObject({latitude:23.701,longitude:90.402,source:'map'});
  expect(selected).not.toHaveProperty('placeId');expect(selected).not.toHaveProperty('countryCode');
});

test('a slow search result cannot recenter the map after a newer explicit map-point selection', async ({ page }) => {
  await picker(page, {holdSearch:true});
  await page.getByLabel('Search chosen location').fill('Hotel');
  await page.getByRole('option',{name:'Hotel suggestion',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.__genericPicker.pendingSearch.length)).toBe(1);
  await page.evaluate(() => window.__genericPicker.maps[0].emit('click',{latLng:{lat:()=>22.7095,lng:()=>90.3667}}));
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.nearbyName)).toBe('Nearby hotel');
  await page.evaluate(() => window.__genericPicker.pendingSearch.shift()());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => window.__genericPicker.maps[0].center)).toEqual({lat:22.7095,lng:90.3667});
  const selected=await page.evaluate(() => window.__genericPicker.picks.at(-1));
  expect(selected).toMatchObject({latitude:22.7095,longitude:90.3667,source:'map'});
  expect(selected).not.toHaveProperty('placeId');
});
