import { test, expect } from '@playwright/test';
import { installPlacesStub } from './helpers/google-places-stub.js';

async function picker(page, options = {}) {
  await page.goto('/?demo=1');
  await page.evaluate(async options => {
    document.body.innerHTML = '<section id="picker"><div class="location-input"><input data-map-search aria-label="Search chosen location"></div><p data-map-status role="status"></p><div data-location-map style="height:280px"></div></section>';
    const state = window.__genericPicker = { maps: [], picks: [], previews: [], failures: [], requests: [], restores: [], selected: 0, country: options.country || '', pending: [], pendingSearch: [], pendingNearby: [], fixtures: {
      hotel: { placeId: 'hotel', text: 'Selected Hotel, Dhaka, Bangladesh', latitude: 23.7, longitude: 90.4, countryCode: 'BD', countryName: 'Bangladesh', attributions: [] },
      foreign: { placeId: 'foreign', text: 'Foreign Hotel, USA', latitude: 41, longitude: -87, countryCode: 'US', countryName: 'United States', attributions: [] },
    } };
    class Map {
      constructor(_container, settings) { this.settings = settings; this.listeners = new globalThis.Map(); this.center = settings.center; state.maps.push(this); }
      addListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); return { remove: () => this.listeners.get(name)?.delete(callback) }; }
      emit(name, value) { for (const callback of this.listeners.get(name) || []) callback(value); }
      panTo(center) { if (options.holdPan) { this.pendingCenter = center; return; } this.center = center; queueMicrotask(() => this.emit('idle')); }
      setZoom(zoom) { this.zoom = zoom; }
      getCenter() { return this.center; }
    }
    window.google = { maps: { importLibrary: async () => ({ Map }), event: { clearInstanceListeners: map => map.listeners.clear() } } };
    const client = {
      ready: async () => ({}),
      async suggest(query, fieldId, request) { state.requests.push({ query, fieldId, request }); return [{ placeId: 'hotel', text: 'Hotel suggestion', main: 'Hotel suggestion', secondary: 'Dhaka, Bangladesh' }]; },
      async select() { state.selected++; if (options.holdSearch) await new Promise(resolve => state.pendingSearch.push(resolve)); return state.fixtures.hotel; },
      async restore(id) { state.restores.push(id); if (options.hold) await new Promise(resolve => state.pending.push(resolve)); return state.fixtures[id]; },
      async describeDeviceLocation(point) { state.nearbyRequests = (state.nearbyRequests || 0) + 1; if (options.holdNearby) await new Promise(resolve=>state.pendingNearby.push(resolve)); return { nearbyName: 'Nearby hotel', nearbyAddress: 'Approximate landmark', attributions: [] }; },
      discardSession() {},
    };
    const { mountPickupMap } = await import('/pickup-map.js');
    state.cleanup = mountPickupMap(document.querySelector('#picker'), {
      client, fieldId: options.fieldId || 'dropoff', label: options.label || 'drop-off', countryCode: () => state.country,
      onPick: place => state.picks.push(place), onPreview: place => state.previews.push(place), onError: message => state.failures.push(message),
    });
  }, options);
  await expect.poll(() => page.evaluate(() => window.__genericPicker.maps.length)).toBe(1);
}

test('an untouched map starts over the United States without selecting a location', async ({ page }) => {
  await picker(page);
  expect(await page.evaluate(() => window.__genericPicker.maps[0].settings)).toMatchObject({center:{lat:39.8283,lng:-98.5795},zoom:4});
  expect(await page.evaluate(() => window.__genericPicker.picks)).toEqual([]);
});

test('typing previews the best predicted area while leaving the booking address unchosen', async ({ page }) => {
  await picker(page,{country:'BD'});
  const input=page.getByLabel('Search chosen location');
  await input.fill('Hotel');
  await expect(page.getByRole('option',{name:'Hotel suggestion',exact:true})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__genericPicker.maps[0].center)).toEqual({lat:23.7,lng:90.4});
  expect(await page.evaluate(() => window.__genericPicker.maps[0].zoom)).toBe(15);
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
  expect(await page.evaluate(() => window.__genericPicker.selected)).toBe(0);
  await expect(input).toHaveValue('Hotel');
  await expect(page.locator('[data-map-status]')).toContainText('Area preview:');
  await expect(page.getByRole('option',{name:'Hotel suggestion',exact:true})).toBeVisible();
  await input.fill('Hotel Dhaka');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.requests.length)).toBe(2);
  await expect(page.locator('[data-map-status]')).toContainText('Area preview:');
  expect(await page.evaluate(() => window.__genericPicker.restores)).toEqual(['hotel']);
});

test('a resolved area remains available for deliberate confirmation after the phone keyboard loses focus', async ({ page }) => {
  await picker(page, {country:'BD'});
  await page.getByLabel('Search chosen location').fill('Hotel');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.previews.at(-1)?.placeId)).toBe('hotel');
  await page.getByLabel('Search chosen location').blur();
  await expect(page.getByRole('option', {name:'Hotel suggestion',exact:true})).toHaveCount(0);
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toMatchObject({placeId:'hotel',latitude:23.7,longitude:90.4,countryCode:'BD',source:'map-place'});
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
});

test('confirmation rejects a moving map and never substitutes intermediate coordinates for a named preview', async ({ page }) => {
  await picker(page, {holdPan:true});
  await page.getByLabel('Search chosen location').fill('Hotel');
  await expect(page.locator('[data-map-status]')).toContainText('Moving the map');
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toBeNull();
  expect(await page.evaluate(() => window.__genericPicker.previews.filter(Boolean))).toEqual([]);
  await page.evaluate(() => {const map=window.__genericPicker.maps[0];map.center=map.pendingCenter;map.emit('idle');});
  await expect.poll(() => page.evaluate(() => window.__genericPicker.previews.at(-1)?.placeId)).toBe('hotel');
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toMatchObject({placeId:'hotel',source:'map-place'});
  await page.evaluate(() => { window.__genericPicker.maps[0].center={lat:23.701,lng:90.402}; });
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toBeNull();
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
});

test('editing, Escape, country changes and unmounting invalidate a previously confirmable preview', async ({ page }) => {
  await picker(page, {country:'BD'});
  const input=page.getByLabel('Search chosen location');
  await input.fill('Hotel');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.previews.at(-1)?.placeId)).toBe('hotel');
  await input.fill('H');
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toBeNull();
  expect(await page.evaluate(() => window.__genericPicker.previews.at(-1))).toBeNull();
  await input.fill('Hotel again');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.previews.at(-1)?.placeId)).toBe('hotel');
  await input.press('Escape');
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toBeNull();
  await input.fill('Hotel after Escape');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.previews.at(-1)?.placeId)).toBe('hotel');
  await page.evaluate(() => {window.__genericPicker.country='US';});
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toBeNull();
  expect(await page.evaluate(() => window.__genericPicker.previews.at(-1))).toBeNull();
  await page.evaluate(() => {window.__genericPicker.country='BD';});
  await input.fill('Hotel after country reset');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.previews.at(-1)?.placeId)).toBe('hotel');
  await page.evaluate(() => window.__genericPicker.cleanup());
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toBeNull();
});

test('short queries do not trigger details lookups and repeated current predictions share one pending lookup', async ({ page }) => {
  await picker(page,{hold:true});
  const input=page.getByLabel('Search chosen location');
  await input.fill('Ho');
  await expect(page.getByRole('option',{name:'Hotel suggestion',exact:true})).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__genericPicker.restores)).toEqual([]);
  await input.fill('Hotel');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.pending.length)).toBe(1);
  await input.fill('Hotel Dhaka');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.requests.length)).toBe(3);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__genericPicker.restores)).toEqual(['hotel']);
  await page.evaluate(() => window.__genericPicker.pending.shift()());
  await expect.poll(() => page.evaluate(() => window.__genericPicker.maps[0].center)).toEqual({lat:23.7,lng:90.4});
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
});

test('typing preview displays safe provider attributions and clears them on cancellation', async ({ page }) => {
  await picker(page);
  await page.evaluate(() => { window.__genericPicker.fixtures.hotel.attributions=[
    {displayName:'<img src=x onerror=alert(1)>',uri:'javascript:alert(1)'},
    {displayName:'Example provider',uri:'https://example.com/attribution'},
  ]; });
  const input=page.getByLabel('Search chosen location');
  await input.fill('Hotel');
  const providers=page.locator('[data-map-preview-attribution]');
  await expect(providers).toContainText('<img src=x onerror=alert(1)>');
  await expect(providers.locator('img')).toHaveCount(0);
  await expect(providers.locator('a')).toHaveCount(1);
  await expect(providers.getByRole('link',{name:'Example provider'})).toHaveAttribute('href','https://example.com/attribution');
  await input.press('Escape');
  await expect(providers).toHaveCount(0);
  expect(await page.evaluate(() => window.__genericPicker.picks.filter(Boolean))).toEqual([]);
});

test('a delayed typing preview cannot overwrite a newer explicit pin or a changed country', async ({ page }) => {
  await picker(page,{country:'BD',hold:true});
  await page.getByLabel('Search chosen location').fill('Hotel');
  await expect.poll(() => page.evaluate(() => window.__genericPicker.pending.length)).toBe(1);
  await page.evaluate(() => window.__genericPicker.maps[0].emit('click',{latLng:{lat:()=>22.7095,lng:()=>90.3667}}));
  await expect.poll(() => page.evaluate(() => window.__genericPicker.picks.at(-1)?.source)).toBe('map');
  await page.evaluate(() => window.__genericPicker.pending.shift()());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => window.__genericPicker.maps[0].center)).toEqual({lat:22.7095,lng:90.3667});
  await page.getByLabel('Search chosen location').fill('Hotel again');
  // A resolved preview lookup may be reused, but it still cannot bypass a
  // country change before the debounced preview runs.
  await expect.poll(() => page.evaluate(() => window.__genericPicker.requests.length)).toBe(2);
  await page.evaluate(() => { window.__genericPicker.country='US'; });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__genericPicker.maps[0].center)).toEqual({lat:22.7095,lng:90.3667});
});

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
  expect(await page.evaluate(() => window.__genericPicker.cleanup.confirmSelection())).toMatchObject({latitude:22.7095,longitude:90.3667,source:'map'});
});

test('late nearby context cannot validate a raw pin under a changed trip country', async ({page}) => {
  await picker(page,{country:'US',holdNearby:true});
  await page.evaluate(()=>window.__genericPicker.maps[0].emit('click',{latLng:{lat:()=>40.7,lng:()=>-73.9}}));
  await expect.poll(()=>page.evaluate(()=>window.__genericPicker.pendingNearby.length)).toBe(1);
  expect(await page.evaluate(()=>window.__genericPicker.cleanup.confirmSelection())).toMatchObject({source:'map',latitude:40.7,longitude:-73.9});
  await page.evaluate(()=>{window.__genericPicker.country='BD';window.__genericPicker.pendingNearby.shift()();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  expect(await page.evaluate(()=>window.__genericPicker.cleanup.confirmSelection())).toBeNull();
  expect(await page.evaluate(()=>window.__genericPicker.picks.filter(Boolean))).toHaveLength(1);
  await expect(page.locator('[data-map-status]')).toContainText('country changed');
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

test.describe('phone map confirmation with touch input', () => {
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

  async function mobileForm(page) {
    const requests=[];
    await page.addInitScript(() => {
      window.__mapsMock={calls:[],libraries:[],pending:[],holdSuggestions:[],holdDetails:[],holdRoutes:[],failRoutes:[],routeResults:{},failSuggestions:[],emptySuggestions:[],release(kind,key){
        const ready=this.pending.filter(item=>item.kind===kind&&item.key===key);this.pending=this.pending.filter(item=>!ready.includes(item));ready.forEach(item=>item.resolve());
      }};
    });
    const config={browserKey:'test-browser-key',browserConfigured:true,routesConfigured:true,providerMode:'server'};
    await page.route('**/maps-config.json',route=>route.fulfill({json:config}));
    await page.route('**/api/maps/config',route=>route.fulfill({json:config}));
    await page.route('https://maps.googleapis.com/maps/api/js?**',route=>{
      const callback=new URL(route.request().url()).searchParams.get('callback');
      return route.fulfill({contentType:'text/javascript',body:`(${installPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();`});
    });
    await page.route('**/api/maps/route',route=>{requests.push(route.request().postDataJSON());return route.fulfill({json:{provider:'google',distanceMeters:25000,durationSeconds:1800}});});
    await page.goto('/');
    return requests;
  }

  test('typing then tapping Use this map point adds phone pickup, drop-off and stop only after confirmation', async ({page}) => {
    const requests=await mobileForm(page);
    const choices=[['pickup','Pickup location','Times Square NYC'],['drop-off','Drop-off location','JFK Airport NYC'],['stop 1','Stop 1','Brooklyn Museum NYC']];
    await page.evaluate(choices=>{
      window.__mapsMock.countries=Object.fromEntries(choices.map(([, ,query])=>['test-'+encodeURIComponent(query),'US']));
      window.__mapsMock.locations=Object.fromEntries(choices.map(([, ,query],index)=>['test-'+encodeURIComponent(query),{lat:40.75-index*.03,lng:-73.98+index*.01}]));
    },choices);
    for(const [field,label,query] of choices){
      if(field==='stop 1')await page.getByRole('button',{name:'Add stop',exact:true}).tap();
      await page.getByRole('button',{name:'Choose '+field+' on map',exact:true}).tap();
      const confirm=page.getByRole('button',{name:'Use this map point',exact:true});
      await expect(confirm).toBeDisabled();
      await page.getByLabel('Search map for '+field,{exact:true}).fill(query);
      await expect(page.locator('[data-map-selection]')).toContainText('Previewed address — not yet added');
      await expect(page.getByLabel(label,{exact:true})).toHaveValue('');
      await expect(confirm).toBeEnabled();
      const before=requests.length;
      // Tap outside the search field, allowing its blur/dropdown cleanup to run
      // before scrolling down to the same explicit confirmation action.
      await page.getByLabel('Date',{exact:true}).tap();
      await expect(page.getByRole('option',{name:query,exact:true})).toHaveCount(0);
      await expect(confirm).toBeEnabled();
      expect(requests).toHaveLength(before);
      await confirm.tap();
      await expect(page.getByLabel(label,{exact:true})).toHaveValue(query);
      await expect(page.locator('[data-map-picker]')).toHaveCount(0);
    }
    await expect.poll(()=>requests.at(-1)?.stops).toEqual([{placeId:'test-'+encodeURIComponent('Brooklyn Museum NYC')}]);
    expect(requests.at(-1).origin).toEqual({placeId:'test-'+encodeURIComponent('Times Square NYC')});
    expect(requests.at(-1).destination).toEqual({placeId:'test-'+encodeURIComponent('JFK Airport NYC')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  });

  test('a touched second suggestion survives keyboard dismissal and confirms that identity instead of the first preview', async ({page}) => {
    await mobileForm(page);
    const query='Central terminal',first='Unrelated first terminal',intended='Intended second terminal';
    await page.evaluate(({query,first,intended})=>{
      window.__mapsMock.suggestionsByQuery={[query]:[first,intended]};
      window.__mapsMock.holdDetails=[intended];
      window.__mapsMock.locations={['test-'+encodeURIComponent(first)]:{lat:40.7,lng:-73.9},['test-'+encodeURIComponent(intended)]:{lat:40.8,lng:-73.8}};
    },{query,first,intended});
    await page.getByRole('button',{name:'Choose pickup on map',exact:true}).tap();
    await page.getByLabel('Search map for pickup',{exact:true}).fill(query);
    await expect(page.locator('[data-map-selection]')).toContainText(first);
    await page.getByRole('option',{name:intended,exact:true}).tap();
    await expect.poll(()=>page.evaluate(()=>window.__mapsMock.pending.some(item=>item.key==='Intended second terminal'))).toBe(true);
    await page.getByLabel('Date',{exact:true}).tap();
    await expect(page.getByRole('button',{name:'Use this map point',exact:true})).toBeDisabled();
    await page.evaluate(()=>window.__mapsMock.release('details','Intended second terminal'));
    await expect(page.locator('[data-map-selection]')).toContainText(intended);
    await expect(page.locator('[data-map-selection]')).toContainText('40.80000, -73.80000');
    await expect(page.getByLabel('Pickup location',{exact:true})).toHaveValue('');
    await page.getByRole('button',{name:'Use this map point',exact:true}).tap();
    await expect(page.getByLabel('Pickup location',{exact:true})).toHaveValue(intended);
    const chosen=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tuxano-booking-v1')).trip.pickupPlace);
    expect(chosen).toMatchObject({placeId:'test-'+encodeURIComponent(intended)});
  });

  test('service rerender clears an unfinished phone preview instead of confirming the previous map identity', async ({page}) => {
    const requests=await mobileForm(page),original='Original map pickup',replacement='Replacement map pickup';
    await page.getByLabel('Pickup location',{exact:true}).fill(original);
    await page.getByRole('option',{name:original,exact:true}).tap();
    await page.getByRole('button',{name:'Choose pickup on map',exact:true}).tap();
    const search=page.getByLabel('Search map for pickup',{exact:true});
    await search.fill(replacement);
    const confirm=page.getByRole('button',{name:'Use this map point',exact:true});
    await expect(page.locator('[data-map-selection]')).toContainText(replacement);
    await expect(confirm).toBeEnabled();
    await page.getByRole('button',{name:'HOURLY',exact:true}).tap();
    await expect(confirm).toBeDisabled();
    await expect(page.locator('[data-map-selection]')).not.toContainText(replacement);
    await expect(page.getByLabel('Pickup location',{exact:true})).toHaveValue(original);
    expect(requests).toHaveLength(0);
    await search.fill(replacement);
    await expect(confirm).toBeEnabled();
    await confirm.tap();
    await expect(page.getByLabel('Pickup location',{exact:true})).toHaveValue(replacement);
  });
});
